'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

function normalizeBangsal(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\//g, ',');
}

function elapsedSinceInput(record, now = Date.now()) {
  if (!record?.waktu_input) return null;
  const startedAt = new Date(record.waktu_input).getTime();
  if (!Number.isFinite(startedAt) || startedAt > now) return null;
  return Math.floor((now - startedAt) / 60000);
}

function isNotReady(record) {
  const status = String(record.status_bed || record.status || '').trim().toLowerCase();
  return !record.bangsal_tujuan && status !== 'siap' && status !== 'kamar siap - menunggu transpor';
}

function applySlaRowColors() {
  const records = Array.isArray(window.dataIgdLokal) ? window.dataIgdLokal : [];
  const rows = document.querySelectorAll('#tabelMonitorIgd tr[data-igd-id]');
  const byId = new Map(records.map((record) => [String(record.id), record]));

  rows.forEach((row) => {
    const record = byId.get(row.dataset.igdId);
    row.classList.remove('sla-under-15', 'sla-between-15-30', 'sla-over-30');
    if (!record || !isNotReady(record)) return;
    const minutes = elapsedSinceInput(record);
    if (minutes == null) return;
    row.classList.add(minutes < 15 ? 'sla-under-15' : minutes <= 30 ? 'sla-between-15-30' : 'sla-over-30');
  });
}

function playFallbackTone(audioContextRef, kind) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    context.resume().catch(() => {});
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'square';
    oscillator.frequency.value = kind === 'alarm' ? 880 : 520;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  } catch (error) {
    console.warn('Audio fallback tidak dapat diputar:', error);
  }
}

export default function DashboardBangsal() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [shiftActive, setShiftActive] = useState(false);
  const [bangsal, setBangsal] = useState('');
  const [status, setStatus] = useState('Notifikasi shift belum aktif.');
  const audioContextRef = useRef(null);
  const alarmAudioRef = useRef(null);
  const buzzerAudioRef = useRef(null);
  const alertedIdsRef = useRef(new Set());
  const originalTitleRef = useRef('');
  const titleTimerRef = useRef(null);

  function playAudio(kind) {
    const audioRef = kind === 'alarm' ? alarmAudioRef : buzzerAudioRef;
    const path = kind === 'alarm' ? '/alarm.mp3' : '/buzzer.mp3';
    if (!audioRef.current) audioRef.current = new Audio(path);
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => playFallbackTone(audioContextRef, kind));
  }

  useEffect(() => {
    originalTitleRef.current = document.title;
    const findPortal = () => {
      const target = document.getElementById('igdRealtimeControls');
      setPortalTarget((current) => current === target ? current : target);
    };
    findPortal();
    const observer = new MutationObserver(findPortal);
    observer.observe(document.body, { childList: true, subtree: true });
    const handleSession = (event) => {
      if (!event.detail?.role) {
        setShiftActive(false);
        setBangsal('');
        setStatus('Notifikasi shift belum aktif.');
        return;
      }
      const app = window.MPPCare;
      const user = event.detail.user || app?.state?.user;
      const room = app?.state?.room || app?.getUserRoom?.(user) || user?.app_metadata?.room || '';
      setBangsal(room);
      if (!room) setStatus('Fitur shift hanya tersedia untuk akun bangsal.');
    };
    window.addEventListener('mppcare:session-ready', handleSession);
    const handleToast = (event) => {
      if (event.detail?.message) toast(event.detail.message, { position: 'top-right', icon: event.detail.type === 'error' ? '⚠️' : '✅' });
    };
    window.addEventListener('mppcare:toast', handleToast);
    return () => {
      observer.disconnect();
      window.removeEventListener('mppcare:session-ready', handleSession);
      window.removeEventListener('mppcare:toast', handleToast);
      if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!shiftActive || !bangsal) return undefined;
    const supabase = window.MPPCare?.supabase;
    if (!supabase) {
      setStatus('Koneksi Supabase belum siap.');
      setShiftActive(false);
      return undefined;
    }

    const channel = supabase.channel('custom-insert-channel')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'monitoring_igd',
      }, (payload) => {
        const patient = payload.new || {};
        const destination = patient.bangsal_tujuan || patient.inden_bangsal;
        if (normalizeBangsal(destination) !== normalizeBangsal(bangsal)) return;

        playAudio('alarm');
        toast(`🚨 Pasien Baru dari IGD: ${patient.nama_pasien || patient.no_rm || 'Pasien'}`, {
          duration: 8000,
          position: 'top-right',
        });
        window.refreshIgdData?.();
        document.title = '(1) 🚨 Pasien IGD Masuk!';
        if (titleTimerRef.current) window.clearTimeout(titleTimerRef.current);
        titleTimerRef.current = window.setTimeout(() => {
          if (document.title === '(1) 🚨 Pasien IGD Masuk!') document.title = originalTitleRef.current;
        }, 10000);
        setStatus(`Pasien baru dari IGD · ${patient.nama_pasien || patient.no_rm || 'Pasien'}`);
      })
      .subscribe((channelStatus) => {
        if (channelStatus === 'SUBSCRIBED') setStatus(`Realtime aktif · ${bangsal}`);
        if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') setStatus('Koneksi realtime terputus.');
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftActive, bangsal]);

  useEffect(() => {
    const checkSla = () => {
      applySlaRowColors();
      if (!shiftActive) return;
      const records = Array.isArray(window.dataIgdLokal) ? window.dataIgdLokal : [];
      let hasNewOverdue = false;
      records.forEach((record) => {
        const minutes = elapsedSinceInput(record);
        if (!isNotReady(record) || minutes == null || minutes <= 30) {
          alertedIdsRef.current.delete(record.id);
          return;
        }
        if (!alertedIdsRef.current.has(record.id)) {
          alertedIdsRef.current.add(record.id);
          hasNewOverdue = true;
        }
      });
      if (hasNewOverdue) {
        const audio = buzzerAudioRef.current || (buzzerAudioRef.current = new Audio('/buzzer.mp3'));
        audio.currentTime = 0;
        audio.play().catch(() => playFallbackTone(audioContextRef, 'buzzer'));
        toast('SLA IGD melewati 30 menit.', { duration: 7000, position: 'top-right' });
      }
    };
    checkSla();
    const timer = window.setInterval(checkSla, 15000);
    return () => window.clearInterval(timer);
  }, [shiftActive]);

  async function startShift() {
    const app = window.MPPCare;
    const user = app?.state?.user;
    const room = app?.state?.room || app?.getUserRoom?.(user) || user?.app_metadata?.room || '';
    if (!room) {
      setStatus('Akun ini belum memiliki bangsal yang ditetapkan.');
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioContextRef.current = audioContextRef.current || new AudioContextClass();
      await audioContextRef.current.resume().catch(() => {});
    }
    setBangsal(room);
    setShiftActive(true);
    setStatus(`Mengaktifkan notifikasi · ${room}`);
  }

  function endShift() {
    setShiftActive(false);
    setStatus(`Shift berakhir · ${bangsal}`);
  }

  const controls = portalTarget ? createPortal(
    <div className="igd-shift-controls">
      <div>
        <strong>Status Notifikasi Bangsal</strong>
        <span className={shiftActive ? 'igd-shift-status is-active' : 'igd-shift-status'} role="status">{status}</span>
      </div>
      <button className={shiftActive ? 'btn btn-outline-danger fw-bold' : 'btn btn-primary fw-bold'} type="button" disabled={!bangsal && !shiftActive} onClick={() => shiftActive ? endShift() : startShift()}>
        <i className={`fas ${shiftActive ? 'fa-bell-slash' : 'fa-bell'} me-2`} />
        {shiftActive ? 'Akhiri Shift' : 'Mulai Shift & Aktifkan Notifikasi'}
      </button>
    </div>,
    portalTarget
  ) : null;

  return <><Toaster position="top-right" /><>{controls}</></>;
}