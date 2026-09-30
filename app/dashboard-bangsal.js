'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';

function normalizeBangsal(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '').replace(/\//g, ',');
}

function elapsedSinceArrival(record, now = Date.now()) {
  const timestamp = record?.waktu_masuk || record?.waktu_input;
  if (!timestamp) return null;
  const startedAt = new Date(timestamp).getTime();
  if (!Number.isFinite(startedAt) || startedAt > now) return null;
  return (now - startedAt) / 60000;
}

function isStillInIgd(record) {
  return !record?.bangsal_tujuan;
}

function applySlaRowColors() {
  const records = Array.isArray(window.dataIgdLokal) ? window.dataIgdLokal : [];
  const rows = document.querySelectorAll('#tabelMonitorIgd tr[data-igd-id]');
  const byId = new Map(records.map((record) => [String(record.id), record]));

  rows.forEach((row) => {
    const record = byId.get(row.dataset.igdId);
    row.classList.remove('sla-under-15', 'sla-between-15-30', 'sla-over-30');
    if (!record || !isStillInIgd(record)) return;
    const minutes = elapsedSinceArrival(record);
    if (minutes == null) return;
    row.classList.add(minutes < 15 ? 'sla-under-15' : minutes <= 30 ? 'sla-between-15-30' : 'sla-over-30');
  });
}

async function playFallbackTone(audioContextRef, kind) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = audioContextRef.current || new AudioContextClass();
    audioContextRef.current = context;
    await context.resume();
    const baseFrequency = kind === 'alarm' ? 880 : 520;
    [0, 0.24, 0.48].forEach((offset, index) => {
      const startAt = context.currentTime + offset;
      const duration = index === 2 ? 0.22 : 0.14;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'square';
      oscillator.frequency.value = index === 1 ? baseFrequency * 0.75 : baseFrequency;
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.2, startAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration + 0.02);
    });
  } catch (error) {
    console.warn('Audio fallback tidak dapat diputar:', error);
  }
}

export default function DashboardBangsal() {
  const [portalTarget, setPortalTarget] = useState(null);
  const [shiftActive, setShiftActive] = useState(false);
  const [bangsal, setBangsal] = useState('');
  const [status, setStatus] = useState('Notifikasi shift belum aktif.');
  const [slaAlarmActive, setSlaAlarmActive] = useState(false);
  const [slaOverdueCount, setSlaOverdueCount] = useState(0);
  const audioContextRef = useRef(null);
  const alarmAudioRef = useRef(null);
  const slaAlarmActiveRef = useRef(false);
  const originalTitleRef = useRef('');
  const titleTimerRef = useRef(null);

  function playAudio(kind) {
    if (!alarmAudioRef.current) alarmAudioRef.current = new Audio('/alarm.mp3');
    alarmAudioRef.current.currentTime = 0;
    alarmAudioRef.current.play().catch(() => { void playFallbackTone(audioContextRef, kind); });
  }

  function getOverdueCount() {
    const records = Array.isArray(window.dataIgdLokal) ? window.dataIgdLokal : [];
    return records.filter((record) => {
      const minutes = elapsedSinceArrival(record);
      return isStillInIgd(record) && minutes != null && minutes > 30;
    }).length;
  }

  function playSlaAlarm() {
    if (!alarmAudioRef.current) alarmAudioRef.current = new Audio('/alarm.mp3');
    alarmAudioRef.current.loop = false;
    alarmAudioRef.current.currentTime = 0;
    alarmAudioRef.current.play().catch(() => { void playFallbackTone(audioContextRef, 'alarm'); });
  }

  function toggleSlaAlarm() {
    const nextActive = !slaAlarmActive;
    if (nextActive) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioContextRef.current = audioContextRef.current || new AudioContextClass();
        audioContextRef.current.resume().catch(() => {});
      }
      const overdueCount = getOverdueCount();
      setSlaOverdueCount(overdueCount);
      if (overdueCount > 0) playSlaAlarm();
    } else if (alarmAudioRef.current) {
      alarmAudioRef.current.pause();
      alarmAudioRef.current.currentTime = 0;
    }
    slaAlarmActiveRef.current = nextActive;
    setSlaAlarmActive(nextActive);
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
    const updateSla = () => {
      applySlaRowColors();
      const overdueCount = getOverdueCount();
      setSlaOverdueCount(overdueCount);
      if (slaAlarmActiveRef.current && overdueCount > 0) playSlaAlarm();
    };
    updateSla();
    window.addEventListener('mppcare:igd-data-updated', updateSla);
    const timer = window.setInterval(updateSla, 60000);
    return () => {
      window.removeEventListener('mppcare:igd-data-updated', updateSla);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!slaAlarmActive) return undefined;
    const checkAndPlay = () => {
      const overdueCount = getOverdueCount();
      setSlaOverdueCount(overdueCount);
      if (overdueCount > 0) {
        playSlaAlarm();
      } else if (alarmAudioRef.current) {
        alarmAudioRef.current.pause();
        alarmAudioRef.current.currentTime = 0;
      }
    };
    const timer = window.setInterval(checkAndPlay, 60000);
    return () => {
      window.clearInterval(timer);
      alarmAudioRef.current?.pause();
      if (alarmAudioRef.current) alarmAudioRef.current.currentTime = 0;
    };
  }, [slaAlarmActive]);

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
    <div className="igd-realtime-control-stack">
      <div className="igd-sla-alarm-controls">
        <div>
          <strong>Monitoring SLA 30 Menit</strong>
          <span className={slaOverdueCount ? 'igd-sla-status is-overdue' : 'igd-sla-status'} role="status">
            {slaOverdueCount ? `${slaOverdueCount} pasien melewati SLA` : 'Tidak ada pasien melewati SLA'}
          </span>
        </div>
        <button className={slaAlarmActive ? 'btn btn-danger fw-bold' : 'btn btn-outline-primary fw-bold'} type="button" aria-pressed={slaAlarmActive} onClick={toggleSlaAlarm}>
          <i className={`fas ${slaAlarmActive ? 'fa-bell' : 'fa-bell-slash'} me-2`} aria-hidden="true" />
          {slaAlarmActive ? 'Matikan Alarm' : 'Aktifkan Alarm'}
        </button>
      </div>
      <div className="igd-shift-controls">
        <div>
          <strong>Status Notifikasi Bangsal</strong>
          <span className={shiftActive ? 'igd-shift-status is-active' : 'igd-shift-status'} role="status">{status}</span>
        </div>
        <button className={shiftActive ? 'btn btn-outline-danger fw-bold' : 'btn btn-primary fw-bold'} type="button" disabled={!bangsal && !shiftActive} onClick={() => shiftActive ? endShift() : startShift()}>
          <i className={`fas ${shiftActive ? 'fa-bell-slash' : 'fa-bell'} me-2`} />
          {shiftActive ? 'Akhiri Shift' : 'Mulai Shift & Aktifkan Notifikasi'}
        </button>
      </div>
    </div>,
    portalTarget
  ) : null;

  return <><Toaster position="top-right" /><>{controls}</></>;
}