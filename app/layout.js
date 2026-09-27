import '../style.css';

export const metadata = {
  title: 'Sistem Informasi MPPCare - RSUD Merah Putih',
  description: 'Sistem koordinasi dan manajemen pelayanan pasien RSUD Merah Putih',
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <meta name="theme-color" content="#123d36" />
        <link
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
          rel="stylesheet"
        />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
