'use client';

import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const statusColors = ['#c78311', '#2677a8', '#16836e'];
const mppColors = { PRIYO: '#16836e', ARUM: '#c78311' };
const criteriaColors = [
  '#16836e', '#2677a8', '#c78311', '#c2413b', '#596b8a',
  '#7a5195', '#008eaa', '#d45087', '#4c956c', '#a05d36',
  '#38598b', '#8a8f32', '#bb3e03', '#4f6d7a', '#a23b72',
  '#2a9d8f', '#bc6c25', '#6c757d', '#577590', '#9b5de5',
];
const criteria = [
  '1. Usia',
  '2. Pasien dengan risiko tinggi',
  '3. Potensi komplain tinggi',
  '4. Kasus dengan penyakit kronis, katastropik, terminal',
  '5. Status fungsional rendah, kebutuhan Activity Daily Living (ADL) yang tinggi',
  '6. Pasien dengan riwayat penggunaan peralatan medis di masa lalu',
  '7. Riwayat gangguan mental, upaya bunuh diri, krisis keluarga, isu sosial, dll',
  '8. Sering masuk IGD, readmisi rumah sakit',
  '9. Perkiraan asuhan dengan biaya tinggi',
  '10. Kemungkinan sistem pembiayaan yang kompleks, adanya masalah finansial',
  '11. Kasus yang melebihi rata-rata lama dirawat',
  '12. Kasus yang diidentifikasi rencana pemulangannya berisiko, membutuhkan kontinuitas pelayanan',
  '13. Pelecehan orang dewasa lemah, pelecehan anak, atau korban kejahatan kekerasan',
  '14. Pelecehan seksual',
  '15. Kekerasan dalam rumah tangga',
  '16. Overdosis',
  '17. Kehamilan remaja',
  '18. Pembiayaan pasien melebihi batas tarif / Tidak ada sistem dukungan sosial',
  '19. Tuna wisma',
  '20. Penumpukan pasien di IGD',
];

function buildChartData(source = {}, financingScope = 'SEMUA') {
  const activations = Array.isArray(source.activations) ? source.activations : [];
  const igdRecords = Array.isArray(source.igdRecords) ? source.igdRecords : [];
  const followUps = Array.isArray(source.followUps) ? source.followUps : [];
  const { role, mppTarget } = source;
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const roomCounts = new Map();

  activations.forEach((activation) => {
    if (!activation.tgl_aktivasi) return;
    const activationDate = new Date(`${activation.tgl_aktivasi}T00:00:00`);
    if (activationDate < weekStart || activationDate > today) return;
    const room = String(activation.ruang || 'Tanpa Ruangan').trim();
    roomCounts.set(room, (roomCounts.get(room) || 0) + 1);
  });

  const roomData = [...roomCounts.entries()]
    .map(([room, count]) => ({ room, count }))
    .sort((left, right) => right.count - left.count || left.room.localeCompare(right.room, 'id'))
    .slice(0, 8);
  const statusCounts = { Menunggu: 0, 'Kamar Siap': 0, Selesai: 0 };
  igdRecords.forEach((record) => {
    if (record.bangsal_tujuan) statusCounts.Selesai += 1;
    else if (record.nomor_bed) statusCounts['Kamar Siap'] += 1;
    else statusCounts.Menunggu += 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const targets = role === 'mpp' && mppTarget
    ? [mppTarget]
    : financingScope === 'SEMUA' ? ['PRIYO', 'ARUM'] : [financingScope];
  const financeCounts = new Map();
  activations.forEach((activation) => {
    const target = activation.mpp_tujuan;
    if (!targets.includes(target)) return;
    const payer = String(activation.jenis_pembiayaan || 'Tidak diisi').trim();
    const counts = financeCounts.get(payer) || { pembiayaan: payer, PRIYO: 0, ARUM: 0 };
    counts[target] += 1;
    financeCounts.set(payer, counts);
  });
  const financingData = [...financeCounts.values()].sort((left, right) => {
    const leftTotal = targets.reduce((sum, target) => sum + left[target], 0);
    const rightTotal = targets.reduce((sum, target) => sum + right[target], 0);
    return rightTotal - leftTotal || left.pembiayaan.localeCompare(right.pembiayaan, 'id');
  });
  const criteriaCounts = new Map(criteria.map((criterion) => [criterion, 0]));
  followUps.forEach((followUp) => {
    (Array.isArray(followUp.analisis_informasi) ? followUp.analisis_informasi : []).forEach((criterion) => {
      if (criteriaCounts.has(criterion)) criteriaCounts.set(criterion, criteriaCounts.get(criterion) + 1);
    });
  });
  const criteriaData = criteria.map((name) => ({ name, value: criteriaCounts.get(name) }));

  return { roomData, statusData, financingData, criteriaData, targets };
}

export default function DashboardCharts() {
  const [source, setSource] = useState({ activations: [], igdRecords: [], followUps: [], role: null, mppTarget: null });
  const [financingScope, setFinancingScope] = useState('SEMUA');
  const { roomData, statusData, financingData, criteriaData, targets } = buildChartData(source, financingScope);
  const restrictedToMpp = source.role === 'mpp' && source.mppTarget;
  const hasCriteria = criteriaData.some((item) => item.value > 0);

  useEffect(() => {
    const handleDashboardData = (event) => setSource((current) => ({ ...current, ...(event.detail || {}) }));
    window.addEventListener('mppcare:dashboard-data', handleDashboardData);
    return () => window.removeEventListener('mppcare:dashboard-data', handleDashboardData);
  }, []);

  return (
    <section className="dashboard-charts" aria-label="Grafik operasional">
      <div className="dashboard-chart-panel">
        <div className="dashboard-chart-heading">
          <div><p className="eyebrow mb-1">7 HARI TERAKHIR</p><h2>Permintaan Aktivasi per Ruangan</h2></div>
        </div>
        <div className="dashboard-recharts-wrap">
          {roomData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roomData} layout="vertical" margin={{ top: 8, right: 18, left: 6, bottom: 8 }}>
                <CartesianGrid stroke="#e5ebf3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="room" width={132} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
                <Tooltip cursor={{ fill: '#eff6f5' }} />
                <Bar dataKey="count" name="Aktivasi" radius={[0, 4, 4, 0]}>
                  {roomData.map((entry, index) => <Cell key={entry.room} fill={['#16836e', '#2677a8', '#c78311', '#596b8a'][index % 4]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="dashboard-chart-empty">Belum ada aktivasi dalam 7 hari terakhir.</p>}
        </div>
      </div>
      <div className="dashboard-chart-panel">
        <div className="dashboard-chart-heading">
          <div><p className="eyebrow mb-1">MONITORING IGD</p><h2>Status Pasien</h2></div>
        </div>
        <div className="dashboard-recharts-wrap dashboard-pie-wrap">
          {statusData.some((item) => item.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="46%" outerRadius="72%" label={({ value }) => value}>
                  {statusData.map((entry, index) => <Cell key={entry.name} fill={statusColors[index]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={34} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="dashboard-chart-empty">Belum ada data pasien IGD.</p>}
        </div>
      </div>
      <div className="dashboard-chart-panel">
        <div className="dashboard-chart-heading dashboard-chart-heading-filter">
          <div><p className="eyebrow mb-1">SELURUH DATA AKTIVASI</p><h2>Jenis Pembiayaan per MPP</h2></div>
          <label className="dashboard-chart-filter">MPP
            <select className="form-select form-select-sm" value={restrictedToMpp ? source.mppTarget : financingScope} disabled={Boolean(restrictedToMpp)} onChange={(event) => setFinancingScope(event.target.value)}>
              <option value="SEMUA">Semua MPP</option>
              <option value="PRIYO">PRIYO</option>
              <option value="ARUM">ARUM</option>
            </select>
          </label>
        </div>
        <div className="dashboard-recharts-wrap dashboard-financing-wrap">
          {financingData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financingData} layout="vertical" margin={{ top: 8, right: 18, left: 8, bottom: 8 }}>
                <CartesianGrid stroke="#e5ebf3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="pembiayaan" width={154} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 10 }} />
                <Tooltip />
                {targets.map((target) => <Bar key={target} dataKey={target} name={`MPP ${target}`} fill={mppColors[target]} radius={[0, 4, 4, 0]} />)}
                <Legend verticalAlign="bottom" height={30} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="dashboard-chart-empty">Belum ada data pembiayaan untuk cakupan ini.</p>}
        </div>
      </div>
      <div className="dashboard-chart-panel">
        <div className="dashboard-chart-heading">
          <div><p className="eyebrow mb-1">TINDAK LANJUT TERSIMPAN</p><h2>Analisis Aktivasi · 20 Kriteria MPP</h2></div>
        </div>
        {hasCriteria ? (
          <div className="dashboard-analysis-layout">
            <div className="dashboard-recharts-wrap dashboard-criteria-pie">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={criteriaData.filter((item) => item.value > 0)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="78%">
                    {criteriaData.filter((item) => item.value > 0).map((item) => <Cell key={item.name} fill={criteriaColors[criteria.indexOf(item.name)]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="dashboard-criteria-legend">
              {criteriaData.map((item, index) => (
                <li key={item.name}>
                  <span className="dashboard-criteria-swatch" style={{ backgroundColor: criteriaColors[index] }} />
                  <span>{item.name}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ol>
          </div>
        ) : <p className="dashboard-chart-empty dashboard-analysis-empty">Belum ada analisis kriteria MPP yang tersimpan.</p>}
      </div>
    </section>
  );
}
