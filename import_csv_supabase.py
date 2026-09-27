import argparse
import base64
import csv
import datetime as dt
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


TABLE_COLUMNS = {
    "monitoring_igd": {
        "tanggal", "no_rm", "nama_pasien", "informed_consent", "inden_bangsal",
        "jam_inden", "jaminan", "jam_daftar", "nomor_bed", "nama_dpjp",
        "koordinasi_kepala_ruang", "koordinasi_dpjp", "koordinasi_ibs",
        "koordinasi_lab", "koordinasi_radiologi", "fasilitas", "advokasi",
        "edukasi", "akar_masalah", "bangsal_tujuan", "tanggal_pindah",
        "jam_pindah", "waktu_tunggu", "waktu_input",
    },
    "aktivasi_mpp": {
        "id", "tgl_aktivasi", "tgl_masuk_rs", "nama_pasien", "no_rm", "usia",
        "ruang", "nama_pelapor", "jenis_pembiayaan", "diagnosa", "dpjp",
        "data_informasi", "mpp_tujuan", "status", "waktu_input",
    },
    "form_a_mpp": {
        "id", "waktu_simpan", "nama_pasien", "nomor_rm", "tgl_lahir", "tgl_mrs",
        "tgl_pengkajian", "bagian_a_skrining", "bagian_b_asesmen", "bagian_c_masalah",
        "bagian_d_sasaran", "bagian_e_perencanaan", "nama_mpp_ttd", "ttd_mpp_data_url",
        "jam_mrs", "jam_pengkajian", "aktivasi_mpp_id",
    },
    "tindak_lanjut_mpp": {
        "id", "aktivasi_mpp_id", "tanggal_tl", "nama_petugas_mpp",
        "analisis_informasi", "plan_of_care", "keterangan", "waktu_simpan",
        "waktu_diperbarui",
    },
}

HEADER_ALIASES = {
    "tanggal": {"tanggal", "tgl", "tanggal masuk", "tgl masuk"},
    "tgl_aktivasi": {"tanggal aktivasi", "tgl aktivasi"},
    "tgl_masuk_rs": {"tanggal masuk rs", "tgl masuk rs", "tanggal mrs"},
    "nama_pasien": {"nama pasien", "pasien"},
    "no_rm": {"no rm", "nomor rm", "norm", "no rekam medis", "nomor rekam medis"},
    "nomor_rm": {"no rm", "nomor rm", "norm", "no rekam medis", "nomor rekam medis"},
    "usia": {"usia", "umur"},
    "ruang": {"ruang", "ruangan", "asal ruangan", "ruang perawatan"},
    "nama_pelapor": {"nama pelapor", "ppa pelapor", "nama ppa"},
    "jenis_pembiayaan": {"jenis pembiayaan", "pembiayaan", "jaminan"},
    "diagnosa": {"diagnosa", "diagnosis"},
    "dpjp": {"dpjp", "nama dpjp", "dpjp utama"},
    "data_informasi": {"data informasi", "informasi", "catatan ppa"},
    "mpp_tujuan": {"mpp tujuan", "petugas mpp", "tujuan mpp"},
    "nama_dpjp": {"nama dpjp"},
    "koordinasi_dpjp": {"dpjp", "koordinasi dpjp"},
    "koordinasi_ibs": {"ibs", "koordinasi ibs"},
    "koordinasi_lab": {"lab", "koordinasi lab", "instalasi laborat"},
    "koordinasi_radiologi": {"radiologi", "koordinasi radiologi"},
    "nomor_bed": {"nomor bed", "nomor bed igd", "bed"},
    "inden_bangsal": {"inden bangsal", "bangsal inden", "bangsal tujuan", "ruang tujuan"},
    "jam_inden": {"jam inden", "waktu inden"},
    "jam_daftar": {"jam daftar", "jam daftar igd"},
    "informed_consent": {"informed consent", "ic"},
    "jaminan": {"jaminan", "jenis jaminan"},
    "akar_masalah": {"akar masalah stagnansi", "akar masalah"},
    "bangsal_tujuan": {"bangsal", "bangsal tujuan akhir", "pindah ke bangsal", "bangsal pindah"},
    "waktu_tunggu": {"waktu tunggu", "waktu tunggu keterangan", "keterangan pindah"},
}

BUNDLE_HEADERS = {
    "legacy_id": {"id unik", "id unik aktivasi"},
    "tgl_aktivasi": {"tanggal aktivasi mpp", "tgl aktivasi mpp", "tanggal aktivasi"},
    "tgl_masuk_rs": {"tanggal masuk rs", "tgl masuk rs"},
    "nama_pasien": {"nama pasien"},
    "no_rm": {"nomor rm", "no rm"},
    "usia": {"usia", "umur"},
    "ruang": {"ruang", "ruangan"},
    "nama_pelapor": {"nama ppa", "nama pelapor"},
    "jenis_pembiayaan": {"jenis pembiayaan"},
    "diagnosa": {"diagnosa", "diagnosis"},
    "dpjp": {"dpjp"},
    "data_informasi": {"data informasi ppa", "data informasi"},
    "mpp_name": {"nama mpp", "nama petugas mpp"},
    "tanggal_tl": {"tanggal di tl mpp", "tanggal tl mpp", "tanggal tindak lanjut mpp"},
    "analisis_informasi": {"analisis informasi"},
    "plan_of_care": {"plan of care mpp", "plan of care"},
    "keterangan": {"keterangan"},
}

MPP_NAME_TARGETS = {
    "WAHYU DYAH SETYANINGRUM": "ARUM",
    "WAHYU DYAH SETYANINGRUM SST": "ARUM",
    "ARUM": "ARUM",
    "PRIYO SULISTIYONO": "PRIYO",
    "PRIYO": "PRIYO",
}
LEGACY_ID_NAMESPACE = uuid.UUID("7d5a74d8-85c1-4db9-9c8d-17735ad7039b")
FORM_A_ID_NAMESPACE = uuid.UUID("b023706d-8318-49bd-a6c0-ced70a278e3d")
FORM_A_HEADERS = {
    "legacy_id": {"id unik pasien", "id unik"},
    "waktu_simpan": {"waktu simpan"},
    "nama_pasien": {"nama pasien"},
    "nomor_rm": {"nomor rm", "no rm"},
    "tgl_lahir": {"tgl lahir", "tanggal lahir"},
    "tgl_mrs": {"tgl mrs", "tanggal mrs"},
    "tgl_pengkajian": {"tgl pengkajian", "tanggal pengkajian"},
    "bagian_a_skrining": {"bagian a skrining", "bagian a skrining pasien"},
    "bagian_b_asesmen": {"bagian b assesmen raw", "bagian b asesmen raw", "bagian b asesmen"},
    "bagian_c_masalah": {"bagian c masalah", "bagian c identifikasi masalah"},
    "bagian_d_sasaran": {"bagian d sasaran", "bagian d"},
    "bagian_e_perencanaan": {"bagian e perencanaan", "bagian e"},
    "nama_mpp_ttd": {"nama mpp ttd", "nama mpp"},
}


def load_local_env():
    for filename in (".env.local", ".env"):
        env_path = Path(__file__).resolve().parent / filename
        if not env_path.exists():
            continue
        for line in env_path.read_text(encoding="utf-8-sig").splitlines():
            match = re.match(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if not match or match.group(1) in os.environ:
                continue
            value = match.group(2)
            if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                value = value[1:-1]
            else:
                value = re.sub(r"\s+#.*$", "", value)
            os.environ[match.group(1)] = value


def normalize_header(value):
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def parse_mapping_args(mapping_args):
    mappings = {}
    for item in mapping_args:
        if "=" not in item:
            raise ValueError(f"Format mapping tidak valid: {item!r}. Gunakan 'Header CSV=nama_kolom'.")
        source, target = item.split("=", 1)
        mappings[source.strip()] = target.strip()
    return mappings


def make_mapping(headers, table, explicit):
    allowed = TABLE_COLUMNS[table]
    mapping = {}
    normalized_headers = {normalize_header(header): header for header in headers}
    aliases = dict(HEADER_ALIASES)

    for column in allowed:
        candidates = {normalize_header(column)}
        candidates.update(normalize_header(alias) for alias in aliases.get(column, set()))
        source = next((normalized_headers[candidate] for candidate in candidates if candidate in normalized_headers), None)
        if source:
            mapping[source] = column

    mapping.update(explicit)
    unknown_targets = sorted(set(mapping.values()) - allowed)
    if unknown_targets:
        raise ValueError(f"Kolom target tidak diizinkan untuk {table}: {', '.join(unknown_targets)}")
    unknown_sources = sorted(set(mapping) - set(headers))
    if unknown_sources:
        raise ValueError(f"Header CSV tidak ditemukan: {', '.join(unknown_sources)}")
    if len(set(mapping.values())) != len(mapping):
        raise ValueError("Dua header CSV dipetakan ke kolom target yang sama.")
    if not mapping:
        raise ValueError("Tidak ada header yang cocok otomatis. Gunakan --map 'Header CSV=kolom_database'.")
    return mapping


def read_csv(path, skip_rows):
    with open(path, "r", encoding="utf-8-sig", newline="") as source:
        sample = source.read(8192)
        source.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except csv.Error:
            dialect = csv.excel
        reader = csv.reader(source, dialect=dialect)
        for _ in range(skip_rows):
            next(reader, None)
        raw_headers = next(reader, None)
        if not raw_headers:
            raise ValueError("CSV tidak memiliki header kolom.")
        headers = [header.strip() if header and header.strip() else f"__kolom_{index + 1}" for index, header in enumerate(raw_headers)]
        rows = [dict(zip(headers, values)) for values in reader]
    return headers, rows


def convert_rows(rows, mapping, empty_as_null):
    converted = []
    for row_number, source_row in enumerate(rows, start=2):
        record = {}
        for source, target in mapping.items():
            value = source_row.get(source)
            if value is None:
                continue
            value = value.strip()
            if value == "":
                if empty_as_null:
                    record[target] = None
                continue
            if target == "analisis_informasi":
                try:
                    parsed = json.loads(value)
                    if not isinstance(parsed, list) or not all(isinstance(item, str) for item in parsed):
                        raise ValueError
                    record[target] = parsed
                except ValueError:
                    record[target] = [item.strip() for item in value.split(";") if item.strip()]
            else:
                record[target] = value
        if record:
            record["_csv_row"] = row_number
            converted.append(record)
    return converted


def validate_records(records, table):
    required = {
        "monitoring_igd": {"no_rm", "nama_pasien"},
        "aktivasi_mpp": {"nama_pasien", "no_rm"},
        "form_a_mpp": {"nama_pasien", "nomor_rm"},
        "tindak_lanjut_mpp": {"aktivasi_mpp_id", "tanggal_tl", "nama_petugas_mpp", "plan_of_care"},
    }[table]
    problems = []
    for record in records:
        missing = sorted(column for column in required if not record.get(column))
        if missing:
            problems.append(f"baris CSV {record['_csv_row']}: kolom wajib kosong ({', '.join(missing)})")
        if table == "aktivasi_mpp" and record.get("mpp_tujuan") and record["mpp_tujuan"].upper() not in {"PRIYO", "ARUM"}:
            problems.append(f"baris CSV {record['_csv_row']}: mpp_tujuan harus PRIYO atau ARUM")
        if table == "aktivasi_mpp" and record.get("ruang") and record["ruang"].upper() == "BOROBUDUR 1 A":
            record["ruang"] = "BOROBUDUR 1A"
        record.pop("_csv_row", None)
    if problems:
        raise ValueError("Validasi CSV gagal:\n- " + "\n- ".join(problems[:20]))


def build_activation_bundle(headers, rows, default_mpp_target):
    normalized_headers = {normalize_header(header): header for header in headers}
    source_columns = {}
    for field, aliases in BUNDLE_HEADERS.items():
        candidates = {normalize_header(alias) for alias in aliases}
        source_columns[field] = next(
            (normalized_headers[candidate] for candidate in candidates if candidate in normalized_headers),
            None,
        )

    required_sources = {"legacy_id", "tgl_aktivasi", "nama_pasien", "no_rm"}
    missing_sources = sorted(field for field in required_sources if not source_columns[field])
    if missing_sources:
        raise ValueError(f"Header CSV wajib tidak ditemukan: {', '.join(missing_sources)}")

    if default_mpp_target and default_mpp_target not in {"PRIYO", "ARUM"}:
        raise ValueError("default_mpp_target harus PRIYO atau ARUM.")

    activation_records = []
    followup_records = []
    target_counts = {"PRIYO": 0, "ARUM": 0, "BELUM DITENTUKAN": 0}
    warnings = {"TANGGAL MASUK RS tidak valid dan dikosongkan": 0}
    seen_legacy_ids = set()
    followup_fields = ("tanggal_tl", "mpp_name", "analisis_informasi", "plan_of_care", "keterangan")

    for row_number, source_row in enumerate(rows, start=2):
        if not any(str(value or "").strip() for value in source_row.values()):
            continue
        get_value = lambda field: str(source_row.get(source_columns[field]) or "").strip() if source_columns[field] else ""
        legacy_id = get_value("legacy_id")
        if not legacy_id:
            raise ValueError(f"Baris CSV {row_number}: ID UNIK kosong; relasi aktivasi dan tindak lanjut tidak aman.")
        if legacy_id in seen_legacy_ids:
            raise ValueError(f"Baris CSV {row_number}: ID UNIK duplikat; impor dibatalkan agar relasi tidak tertukar.")
        seen_legacy_ids.add(legacy_id)

        patient_name = get_value("nama_pasien")
        medical_record = get_value("no_rm")
        activation_date = get_value("tgl_aktivasi")
        if not patient_name or not medical_record or not activation_date:
            raise ValueError(f"Baris CSV {row_number}: nama pasien, nomor RM, dan tanggal aktivasi wajib terisi.")

        mpp_name = get_value("mpp_name")
        mpp_target = MPP_NAME_TARGETS.get(mpp_name.upper()) if mpp_name else None
        if mpp_name and not mpp_target:
            raise ValueError(f"Baris CSV {row_number}: nama petugas MPP tidak dikenali; tambahkan pemetaan sebelum impor.")
        mpp_target = mpp_target or default_mpp_target

        followup_values = {field: get_value(field) for field in followup_fields}
        has_followup = any(followup_values.values())
        if has_followup:
            required_followup = ("tanggal_tl", "mpp_name", "plan_of_care")
            missing_followup = [field for field in required_followup if not followup_values[field]]
            if missing_followup:
                raise ValueError(
                    f"Baris CSV {row_number}: tindak lanjut tidak lengkap ({', '.join(missing_followup)})."
                )

        activation_id = str(uuid.uuid5(LEGACY_ID_NAMESPACE, legacy_id))
        activation = {"id": activation_id, "nama_pasien": patient_name, "no_rm": medical_record, "tgl_aktivasi": activation_date}
        activation_fields = (
            ("tgl_masuk_rs", "tgl_masuk_rs"),
            ("usia", "usia"),
            ("ruang", "ruang"),
            ("nama_pelapor", "nama_pelapor"),
            ("jenis_pembiayaan", "jenis_pembiayaan"),
            ("diagnosa", "diagnosa"),
            ("dpjp", "dpjp"),
            ("data_informasi", "data_informasi"),
        )
        for source_field, target_column in activation_fields:
            value = get_value(source_field)
            if value:
                if target_column == "tgl_masuk_rs" and "#" in value:
                    warnings["TANGGAL MASUK RS tidak valid dan dikosongkan"] += 1
                    continue
                activation[target_column] = value
        if mpp_target:
            activation["mpp_tujuan"] = mpp_target
            target_counts[mpp_target] += 1
        else:
            target_counts["BELUM DITENTUKAN"] += 1
        activation["status"] = "Selesai" if has_followup else "Menunggu"
        activation_records.append(activation)

        if has_followup:
            analysis = followup_values["analisis_informasi"]
            if analysis:
                try:
                    parsed_analysis = json.loads(analysis)
                    if not isinstance(parsed_analysis, list) or not all(isinstance(item, str) for item in parsed_analysis):
                        raise ValueError
                except (ValueError, json.JSONDecodeError):
                    parsed_analysis = [item.strip() for item in re.split(r";\s*|\r?\n", analysis) if item.strip()]
            else:
                parsed_analysis = []
            followup = {
                "aktivasi_mpp_id": activation_id,
                "tanggal_tl": followup_values["tanggal_tl"],
                "nama_petugas_mpp": mpp_name,
                "analisis_informasi": parsed_analysis,
                "plan_of_care": followup_values["plan_of_care"],
            }
            if followup_values["keterangan"]:
                followup["keterangan"] = followup_values["keterangan"]
            followup_records.append(followup)

    if not activation_records:
        raise ValueError("Tidak ada baris aktivasi yang siap diimpor.")
    return activation_records, followup_records, target_counts, warnings


def parse_form_date(value, row_number, field):
    value = str(value or "").strip()
    if not value:
        return None
    try:
        if re.match(r"^\d{4}-\d{2}-\d{2}", value):
            return dt.datetime.fromisoformat(value.replace("Z", "+00:00")).date().isoformat()
        match = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})[/-](\d{4})", value)
        if match:
            return dt.date(int(match[3]), int(match[2]), int(match[1])).isoformat()
        match = re.fullmatch(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", value)
        if match:
            months = {
                "jan": 1, "januari": 1, "feb": 2, "februari": 2,
                "mar": 3, "maret": 3, "apr": 4, "april": 4,
                "mei": 5, "jun": 6, "juni": 6, "jul": 7, "juli": 7,
                "agu": 8, "agt": 8, "agustus": 8, "aug": 8, "august": 8,
                "sep": 9, "sept": 9, "september": 9,
                "okt": 10, "oktober": 10, "oct": 10, "october": 10,
                "nov": 11, "november": 11,
                "des": 12, "desember": 12, "dec": 12, "december": 12,
            }
            month = months.get(match[2].lower())
            if month:
                return dt.date(int(match[3]), month, int(match[1])).isoformat()
    except ValueError as error:
        raise ValueError(f"Baris CSV {row_number}: tanggal {field} tidak valid.") from error
    raise ValueError(f"Baris CSV {row_number}: format tanggal {field} tidak dikenali.")


def parse_form_timestamp(value, row_number):
    value = str(value or "").strip()
    if not value:
        return None
    try:
        parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00")) if re.match(r"^\d{4}-\d{2}-\d{2}T", value) else None
        if parsed is None:
            for date_format in ("%d/%m/%Y, %H.%M.%S", "%d/%m/%Y %H.%M.%S", "%d/%m/%Y, %H.%M"):
                try:
                    parsed = dt.datetime.strptime(value, date_format).replace(tzinfo=dt.timezone(dt.timedelta(hours=7)))
                    break
                except ValueError:
                    continue
        if parsed is None:
            raise ValueError
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=dt.timezone(dt.timedelta(hours=7)))
        return parsed.isoformat()
    except ValueError as error:
        raise ValueError(f"Baris CSV {row_number}: format waktu simpan tidak dikenali.") from error


def split_form_choices(value):
    return [item.strip() for item in re.split(r",\s*", str(value or "")) if item.strip() and item.strip(" |")]


def build_form_a_records(headers, rows):
    normalized_headers = {normalize_header(header): header for header in headers}
    source_columns = {}
    for field, aliases in FORM_A_HEADERS.items():
        candidates = {normalize_header(alias) for alias in aliases}
        source_columns[field] = next(
            (normalized_headers[candidate] for candidate in candidates if candidate in normalized_headers),
            None,
        )
    required_sources = {"legacy_id", "nama_pasien", "nomor_rm"}
    missing_sources = sorted(field for field in required_sources if not source_columns[field])
    if missing_sources:
        raise ValueError(f"Header Form A wajib tidak ditemukan: {', '.join(missing_sources)}")

    records = []
    seen_legacy_ids = set()
    for row_number, source_row in enumerate(rows, start=2):
        if not any(str(value or "").strip() for value in source_row.values()):
            continue
        get_value = lambda field: str(source_row.get(source_columns[field]) or "").strip() if source_columns[field] else ""
        legacy_id = get_value("legacy_id")
        if not legacy_id:
            raise ValueError(f"Baris CSV {row_number}: ID UNIK PASIEN kosong; relasi Form A tidak aman.")
        if legacy_id in seen_legacy_ids:
            raise ValueError(f"Baris CSV {row_number}: ID UNIK PASIEN duplikat; impor dibatalkan.")
        seen_legacy_ids.add(legacy_id)

        name = get_value("nama_pasien")
        medical_record = get_value("nomor_rm")
        if not name or not medical_record:
            raise ValueError(f"Baris CSV {row_number}: nama pasien dan nomor RM wajib terisi.")

        assessment = {}
        raw_assessment = get_value("bagian_b_asesmen")
        if raw_assessment:
            try:
                parsed_assessment = json.loads(raw_assessment)
                if not isinstance(parsed_assessment, dict):
                    raise ValueError
                assessment = {
                    "checked": [],
                    "radios": {key: value for key, value in parsed_assessment.items() if key.startswith("b_") and value},
                    "extras": {
                        {"rwt_pernah": "pernah", "rwt_rpd": "rpd"}.get(key, key): value
                        for key, value in parsed_assessment.items() if not key.startswith("b_") and value
                    },
                }
            except (ValueError, json.JSONDecodeError):
                assessment = {"checked": split_form_choices(raw_assessment), "radios": {}, "extras": {}}

        record = {
            "id": str(uuid.uuid5(FORM_A_ID_NAMESPACE, legacy_id)),
            "aktivasi_mpp_id": str(uuid.uuid5(LEGACY_ID_NAMESPACE, legacy_id)),
            "nama_pasien": name,
            "nomor_rm": medical_record,
            "bagian_b_asesmen": json.dumps(assessment, ensure_ascii=False),
        }
        date_fields = ("tgl_lahir", "tgl_mrs", "tgl_pengkajian")
        for field in date_fields:
            value = parse_form_date(get_value(field), row_number, field)
            if value:
                record[field] = value
        timestamp = parse_form_timestamp(get_value("waktu_simpan"), row_number)
        if timestamp:
            record["waktu_simpan"] = timestamp

        for field in ("bagian_a_skrining", "bagian_c_masalah", "bagian_d_sasaran", "bagian_e_perencanaan"):
            choices = split_form_choices(get_value(field))
            if field == "bagian_e_perencanaan":
                choices = [choice for choice in choices if choice != "-"]
            record[field] = json.dumps({"checked": choices, "radios": {}, "extras": {}}, ensure_ascii=False)
        signer = get_value("nama_mpp_ttd")
        if signer:
            record["nama_mpp_ttd"] = signer
        records.append(record)

    if not records:
        raise ValueError("Tidak ada baris Form A yang siap diimpor.")
    return records


def get_config():
    load_local_env()
    url = (os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise ValueError("Isi NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di .env.local.")
    if key.startswith("sb_publishable_"):
        raise ValueError("Key yang diberikan terlihat seperti public/anon key. Impor historis memerlukan secret service_role key.")
    if key.count(".") == 2:
        try:
            payload = key.split(".")[1]
            payload += "=" * (-len(payload) % 4)
            claims = json.loads(base64.urlsafe_b64decode(payload))
            if claims.get("role") == "anon":
                raise ValueError("Key yang diberikan adalah anon key. Impor historis memerlukan secret service_role key.")
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            raise ValueError("Key JWT tidak valid. Pastikan key Supabase disalin utuh.")
    return url, key


def send_batch(url, key, table, records, conflict):
    query = f"?on_conflict={urllib.parse.quote(conflict)}" if conflict else ""
    endpoint = f"{url}/rest/v1/{urllib.parse.quote(table)}{query}"
    preferences = ["return=minimal"]
    if conflict:
        preferences.append("resolution=merge-duplicates")
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(records).encode("utf-8"),
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": ",".join(preferences),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase menolak batch ({error.code}): {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Gagal menghubungi Supabase: {error.reason}") from error


def fetch_existing_records(url, key, table, columns):
    page_size = 500
    offset = 0
    records = []
    selected_columns = urllib.parse.quote(",".join(sorted(columns)), safe=",")
    endpoint = f"{url}/rest/v1/{urllib.parse.quote(table)}?select={selected_columns}"

    while True:
        request = urllib.request.Request(
            endpoint,
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Range-Unit": "items",
                "Range": f"{offset}-{offset + page_size - 1}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                batch = json.loads(response.read().decode("utf-8"))
                content_range = response.headers.get("Content-Range", "")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"Gagal membaca data yang sudah ada ({error.code}): {detail}") from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"Gagal menghubungi Supabase: {error.reason}") from error

        records.extend(batch)
        offset += len(batch)
        total = content_range.rsplit("/", 1)[-1]
        if not batch or len(batch) < page_size or (total.isdigit() and offset >= int(total)):
            return records


def normalize_monitoring_value(column, value):
    if value is None or not str(value).strip():
        return None
    value = str(value).strip()

    if column in {"tanggal", "tanggal_pindah"}:
        if re.fullmatch(r"\d{1,2}[/-]\d{1,2}[/-]\d{4}", value):
            day, month, year = re.split(r"[/-]", value)
            return dt.date(int(year), int(month), int(day)).isoformat()
        return dt.date.fromisoformat(value[:10]).isoformat()

    if column in {"jam_inden", "jam_daftar", "jam_pindah"}:
        match = re.fullmatch(r"(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?", value)
        if not match:
            raise ValueError(f"Format waktu pada kolom {column} tidak dikenali.")
        hour, minute, second = (int(part or 0) for part in match.groups())
        return dt.time(hour, minute, second).isoformat()

    return value


def monitoring_signature(record, columns):
    return tuple(
        (column, normalize_monitoring_value(column, record.get(column)))
        for column in sorted(columns)
    )


def exclude_existing_monitoring_records(url, key, records, columns):
    existing_records = fetch_existing_records(url, key, "monitoring_igd", columns)
    existing_signatures = {
        monitoring_signature(record, columns) for record in existing_records
    }
    seen_signatures = set()
    new_records = []
    existing_duplicates = 0
    file_duplicates = 0

    for record in records:
        signature = monitoring_signature(record, columns)
        if signature in existing_signatures:
            existing_duplicates += 1
        elif signature in seen_signatures:
            file_duplicates += 1
        else:
            seen_signatures.add(signature)
            new_records.append(record)

    return new_records, existing_duplicates, file_duplicates


def send_records(url, key, table, records, conflict, batch_size):
    records_by_columns = {}
    for record in records:
        columns = tuple(sorted(record))
        records_by_columns.setdefault(columns, []).append(record)
    uploaded = 0
    for matching_records in records_by_columns.values():
        for offset in range(0, len(matching_records), batch_size):
            batch = matching_records[offset:offset + batch_size]
            send_batch(url, key, table, batch, conflict)
            uploaded += len(batch)
            print(f"public.{table}: {uploaded}/{len(records)}")


def verify_activation_links(url, key, records):
    activation_ids = sorted({record["aktivasi_mpp_id"] for record in records})
    encoded_ids = urllib.parse.quote(f"in.({','.join(activation_ids)})", safe="(),")
    endpoint = f"{url}/rest/v1/aktivasi_mpp?select=id&id={encoded_ids}"
    request = urllib.request.Request(
        endpoint,
        headers={"apikey": key, "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            found = {row["id"] for row in json.loads(response.read().decode("utf-8"))}
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Gagal memeriksa relasi aktivasi ({error.code}): {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Gagal menghubungi Supabase untuk memeriksa relasi: {error.reason}") from error

    missing = len(set(activation_ids) - found)
    if missing:
        raise ValueError(f"{missing} ID aktivasi Form A belum ditemukan di Supabase. Tidak ada Form A yang diimpor.")
    print(f"Relasi aktivasi terverifikasi: {len(found)}")


def main():
    parser = argparse.ArgumentParser(
        description="Impor CSV spreadsheet ke tabel MPPCare di Supabase. Preview adalah mode default; --confirm baru menulis data."
    )
    parser.add_argument("--csv", required=True, help="Path file CSV hasil export spreadsheet")
    parser.add_argument("--table", required=True, choices=sorted(TABLE_COLUMNS) + ["aktivasi_mpp_bundle", "form_a_bundle"], help="Tabel tujuan; bundle memecah CSV legacy menjadi tabel aplikasi terkait")
    parser.add_argument("--skip-rows", type=int, default=0, help="Jumlah baris judul sebelum header kolom (default: 0)")
    parser.add_argument("--map", action="append", default=[], metavar="HEADER=KOLOM", help="Pemetaan manual; boleh diulang")
    parser.add_argument("--default-mpp-target", choices=["PRIYO", "ARUM"], help="Penugasan default untuk aktivasi tanpa nama MPP; khusus mode aktivasi_mpp_bundle")
    parser.add_argument("--empty-as-null", action="store_true", help="Ubah sel kosong menjadi NULL (default: biarkan nilai default database)")
    parser.add_argument("--batch-size", type=int, default=100, help="Jumlah baris per request (maksimum 500)")
    parser.add_argument("--on-conflict", help="Kolom unik untuk upsert, misalnya id; harus memiliki unique constraint di database")
    parser.add_argument("--confirm", action="store_true", help="Konfirmasi bahwa data CSV akan ditulis ke Supabase")
    args = parser.parse_args()

    if not 1 <= args.batch_size <= 500:
        parser.error("--batch-size harus antara 1 dan 500")
    if args.skip_rows < 0:
        parser.error("--skip-rows tidak boleh negatif")
    if args.default_mpp_target and args.table != "aktivasi_mpp_bundle":
        parser.error("--default-mpp-target hanya berlaku untuk --table aktivasi_mpp_bundle")
    if args.on_conflict and args.on_conflict not in TABLE_COLUMNS[args.table]:
        parser.error("--on-conflict harus berupa kolom yang diizinkan pada tabel tujuan")

    try:
        headers, source_rows = read_csv(args.csv, args.skip_rows)
        if args.table == "form_a_bundle":
            form_records = build_form_a_records(headers, source_rows)
            print(f"File: {Path(args.csv).resolve()}")
            print(f"Baris CSV: {len(source_rows)} | Form A siap: {len(form_records)}")
            print(f"ID Form A unik: {len({record['id'] for record in form_records})}")
            print(f"Relasi aktivasi unik: {len({record['aktivasi_mpp_id'] for record in form_records})}")
            print(f"Nilai waktu simpan diimpor: {sum('waktu_simpan' in record for record in form_records)}")
            print("Preview tidak menampilkan isi atau identitas pasien.")
            if not args.confirm:
                print("\nPREVIEW SAJA: belum ada data dikirim. Setelah jumlah dan relasi dipastikan, tambahkan --confirm.")
                return 0
            url, key = get_config()
            verify_activation_links(url, key, form_records)
            send_records(url, key, "form_a_mpp", form_records, "id", args.batch_size)
            print("Migrasi Form A selesai. Pengulangan aman menggunakan ID Form A stabil.")
            return 0

        if args.table == "aktivasi_mpp_bundle":
            activation_records, followup_records, target_counts, warnings = build_activation_bundle(
                headers, source_rows, args.default_mpp_target
            )
            print(f"File: {Path(args.csv).resolve()}")
            print(f"Baris CSV: {len(source_rows)} | Aktivasi: {len(activation_records)} | Tindak lanjut: {len(followup_records)}")
            print("Tujuan MPP:")
            for target, count in target_counts.items():
                print(f"  {target}: {count}")
            for warning, count in warnings.items():
                if count:
                    print(f"Peringatan: {warning}: {count} baris")
            print("Preview tidak menampilkan isi atau identitas pasien.")
            if not args.confirm:
                print("\nPREVIEW SAJA: belum ada data dikirim.")
                if target_counts["BELUM DITENTUKAN"]:
                    print("Tentukan --default-mpp-target PRIYO atau ARUM hanya jika semua aktivasi tanpa nama MPP memang ditugaskan ke petugas tersebut.")
                print("Setelah penugasan dan jumlah baris dipastikan, tambahkan --confirm untuk mengimpor.")
                return 0
            if target_counts["BELUM DITENTUKAN"]:
                raise ValueError(
                    f"{target_counts['BELUM DITENTUKAN']} aktivasi belum memiliki tujuan MPP. "
                    "Tentukan --default-mpp-target berdasarkan spreadsheet sumber sebelum impor."
                )
            url, key = get_config()
            send_records(url, key, "aktivasi_mpp", activation_records, "id", args.batch_size)
            if followup_records:
                send_records(url, key, "tindak_lanjut_mpp", followup_records, "aktivasi_mpp_id", args.batch_size)
            print("Migrasi bundle selesai. Pengulangan aman: ID aktivasi diturunkan stabil dari ID UNIK lama.")
            return 0

        mapping = make_mapping(headers, args.table, parse_mapping_args(args.map))
        records = convert_rows(source_rows, mapping, args.empty_as_null)
        validate_records(records, args.table)
        url = key = None
        existing_duplicates = 0
        file_duplicates = 0
        if args.table == "monitoring_igd":
            url, key = get_config()
            records, existing_duplicates, file_duplicates = exclude_existing_monitoring_records(
                url, key, records, set(mapping.values())
            )
        print(f"File: {Path(args.csv).resolve()}")
        print(f"Tabel: public.{args.table}")
        print(f"Baris CSV: {len(source_rows)} | Baris siap: {len(records)}")
        if args.table == "monitoring_igd":
            print(f"Duplikat dengan data database, dilewati: {existing_duplicates}")
            print(f"Duplikat berulang di CSV, dilewati: {file_duplicates}")
            print(f"Baris baru yang akan diimpor: {len(records)}")
        print("Pemetaan:")
        for source, target in mapping.items():
            print(f"  {source} -> {target}")
        print(f"Baris contoh tersedia: {min(3, len(records))} (nilai pasien disembunyikan untuk privasi)")
        if len(records) > 3:
            print(f"... dan {len(records) - 3} baris lainnya")
        if not args.confirm:
            print("\nPREVIEW SAJA: tidak ada data dikirim. Tambahkan --confirm setelah memeriksa pemetaan dan contoh.")
            return 0
        if not records:
            print("Tidak ada baris baru untuk diimpor.")
            return 0

        if url is None or key is None:
            url, key = get_config()
        send_records(url, key, args.table, records, args.on_conflict, args.batch_size)
        print("Impor selesai.")
        return 0
    except (OSError, csv.Error, ValueError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())