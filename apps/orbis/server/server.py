#!/usr/bin/env python3
"""OrbisWork prototype backend.

Zero-dependency HTTP server (Python standard library only) that serves the
static OrbisWork front-end and exposes a small JSON persistence API backed by
SQLite. OrbisWork is the merged app: it combines the Orbis (communication,
identity and protection) collections with the Loker (chat-first jobs for
Indonesia with verified employers) collections under a single backend.

State injection happens at serve-time: index.html and mobile.html are read from
disk, injected with a small shim script, and served without modifying the
on-disk files.

Usage:
    python server.py                 # http://127.0.0.1:8792/ (opens browser)
    python server.py --port 9000     # custom port
    python server.py --no-browser    # do not open a browser

The same API is reachable from a page opened directly via file:// because all
responses carry permissive CORS headers.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import threading
import webbrowser
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
WEB_DIR = BASE_DIR.parent / "web"
APP_NAME = "orbis"
APP_VERSION = "1.0"

DB_PATH = Path(os.environ.get("ORBIS_DB") or (BASE_DIR / "data" / "orbis.db"))

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
}

_DB_LOCK = threading.Lock()

LS_KEY_INDEX = "orbiswork_demo_v1"
LS_KEY_MOBILE = "orbiswork_mobile_v1"

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------


def _seed_audit() -> list:
    # Stored oldest-first so appended events land at the end; GET reverses.
    return [
        {"actor": "you", "action": "enabled quiet hours", "object": "settings",
         "time": "2026-10-08T22:00:00+00:00"},
        {"actor": "system", "action": "deleted expired refs", "object": "47 items",
         "time": "2026-10-10T03:00:00+00:00"},
        {"actor": "you", "action": "updated Aura", "object": "profile",
         "time": "2026-10-12T16:45:00+00:00"},
        {"actor": "you", "action": "connected source", "object": "Gmail",
         "time": "2026-10-15T09:15:00+00:00"},
        {"actor": "you", "action": "exported data", "object": "growth-data.json",
         "time": "2026-10-18T14:32:00+00:00"},
    ]


def build_seed_state() -> dict:
    """Return the full first-run seed document for the OrbisWork app.

    The first 17 keys come verbatim from the Loker seed; the remaining 10
    (queue, commitments, summaries, drafts, aura, culture, growth, sources,
    audit, settings) come verbatim from the Orbis seed. The Orbis ``work``
    collection is intentionally omitted because the merged app uses
    ``jobs``/``candidates`` as its work domain.
    """
    return {
        "me": {
            "id": "me_001",
            "name": "Andi Pratama",
            "headline": "Barista & Pelayanan \u2022 2 tahun pengalaman",
            "headline_en": "Barista & Front-of-House \u2022 2 years of experience",
            "location": "Jakarta Selatan",
            "avatar": "",
            "completeness": 80,
            "skills": ["Barista", "Customer Service", "Kasir"],
            "verified": True,
            "responseRate": 95,
            "expectedSalary": "Rp3,5 jt/bln",
            "education": "SMA/SMK",
            "education_en": "High school",
            "experience": "2 tahun",
            "experience_en": "2 years",
            "city": "Jakarta Selatan",
        },
        "role": "seeker",
        "mode": "seeker",
        "applications": [],
        "privacy": {"hideProfile": False, "blockedCompanies": []},
        "vip": False,
        "employers": [
            {
                "id": "emp_001",
                "name": "Kopi Nusantara",
                "industry": "F&B",
                "industry_en": "F&B",
                "location": "Jakarta Selatan",
                "verified": True,
                "responseRate": 96,
                "logoColor": "#0E7C66",
                "about": "Rantai kedai kopi lokal dengan 30+ cabang di Jabodetabek.",
                "about_en": "Local coffee chain with 30+ outlets across Greater Jakarta.",
                "size": "50-100 karyawan",
                "size_en": "50-100 employees",
                "funding": "Perusahaan keluarga",
                "funding_en": "Family business",
                "rating": 4.6,
                "reviewCount": 128,
                "openings": 2,
                "reviews": [
                    {"author": "Budi S.", "rating": 5, "text": "Lingkungan kerja bagus, atasan suportif.", "text_en": "Great work environment, supportive management."},
                    {"author": "Sari M.", "rating": 4, "text": "Gaji kompetitif, jam kerja fleksibel.", "text_en": "Competitive salary, flexible hours."},
                ],
            },
            {
                "id": "emp_002",
                "name": "Elektronik Jaya",
                "industry": "Retail",
                "industry_en": "Retail",
                "location": "Bandung",
                "verified": False,
                "responseRate": 58,
                "logoColor": "#B45309",
                "about": "Toko elektronik keluarga sejak 1998.",
                "about_en": "Family-run electronics store since 1998.",
                "size": "1-10 karyawan",
                "size_en": "1-10 employees",
                "funding": "Perusahaan keluarga",
                "funding_en": "Family business",
                "rating": 3.9,
                "reviewCount": 24,
                "openings": 1,
                "reviews": [
                    {"author": "Ahmad R.", "rating": 4, "text": "Toko kecil tapi nyaman.", "text_en": "Small store but comfortable."},
                    {"author": "Dewi L.", "rating": 3, "text": "Pengalaman oke untuk pemula.", "text_en": "Good experience for beginners."},
                ],
            },
            {
                "id": "emp_003",
                "name": "PT Kirim Cepat",
                "industry": "Logistik",
                "industry_en": "Logistics",
                "location": "Tangerang",
                "verified": True,
                "responseRate": 88,
                "logoColor": "#1D4ED8",
                "about": "Jasa pengiriman ekspres dengan 500+ kurir.",
                "about_en": "Express delivery service with 500+ couriers.",
                "size": "500+ karyawan",
                "size_en": "500+ employees",
                "funding": "Pendanaan Seri A",
                "funding_en": "Series A funded",
                "rating": 4.2,
                "reviewCount": 310,
                "openings": 2,
                "reviews": [
                    {"author": "Joko P.", "rating": 5, "text": "Perusahaan besar, banyak benefit.", "text_en": "Large company, many benefits."},
                    {"author": "Rina W.", "rating": 4, "text": "Kerja keras tapi sebanding.", "text_en": "Hard work but worth it."},
                ],
            },
            {
                "id": "emp_004",
                "name": "Sate Pak Kumis",
                "industry": "F&B",
                "industry_en": "F&B",
                "location": "Yogyakarta",
                "verified": True,
                "responseRate": 92,
                "logoColor": "#B91C1C",
                "about": "Warung sate legendaris, 3 cabang.",
                "about_en": "Legendary satay eatery with 3 outlets.",
                "size": "10-50 karyawan",
                "size_en": "10-50 employees",
                "funding": "Perusahaan keluarga",
                "funding_en": "Family business",
                "rating": 4.8,
                "reviewCount": 96,
                "openings": 1,
                "reviews": [
                    {"author": "Yanto B.", "rating": 5, "text": "Suasana kekeluargaan.", "text_en": "Family atmosphere."},
                    {"author": "Lestari K.", "rating": 5, "text": "Pelanggan senang, tips bagus.", "text_en": "Happy customers, good tips."},
                ],
            },
        ],
        "candidates": [
            {
                "id": "cand_001",
                "name": "Dina Kusuma",
                "headline": "Barista berpengalaman",
                "headline_en": "Experienced barista",
                "location": "Jakarta Selatan",
                "skills": ["Barista", "Customer Service"],
                "experience": "2 tahun",
                "experience_en": "2 years",
                "education": "SMA/SMK",
                "education_en": "High school",
                "expectedSalary": "Rp3,5 jt",
                "match": 94,
                "note": "Aktif membalas",
                "note_en": "Quick responder",
                "avatar": "",
            },
            {
                "id": "cand_002",
                "name": "Rudi Hartono",
                "headline": "Kurir motor",
                "headline_en": "Motorbike courier",
                "location": "Tangerang",
                "skills": ["SIM C", "Navigasi"],
                "experience": "3 tahun",
                "experience_en": "3 years",
                "education": "SMA/SMK",
                "education_en": "High school",
                "expectedSalary": "Rp4 jt",
                "match": 88,
                "note": "Siap mulai segera",
                "note_en": "Available immediately",
                "avatar": "",
            },
            {
                "id": "cand_003",
                "name": "Siti Nurhaliza",
                "headline": "Kasir & admin",
                "headline_en": "Cashier & admin",
                "location": "Bandung",
                "skills": ["Kasir", "Microsoft Excel"],
                "experience": "1 tahun",
                "experience_en": "1 year",
                "education": "D3",
                "education_en": "Diploma",
                "expectedSalary": "Rp3 jt",
                "match": 82,
                "note": "Part-time only",
                "note_en": "Part-time only",
                "avatar": "",
            },
            {
                "id": "cand_004",
                "name": "Ahmad Fauzi",
                "headline": "Pelayan restoran",
                "headline_en": "Restaurant server",
                "location": "Yogyakarta",
                "skills": ["Service", "Komunikasi"],
                "experience": "1 tahun",
                "experience_en": "1 year",
                "education": "SMA/SMK",
                "education_en": "High school",
                "expectedSalary": "Rp2,8 jt",
                "match": 79,
                "note": "Fleksibel",
                "note_en": "Flexible",
                "avatar": "",
            },
            {
                "id": "cand_005",
                "name": "Maya Sari",
                "headline": "Sales & marketing",
                "headline_en": "Sales & marketing",
                "location": "Jakarta",
                "skills": ["Penjualan", "Komunikasi"],
                "experience": "4 tahun",
                "experience_en": "4 years",
                "education": "S1",
                "education_en": "Bachelor",
                "expectedSalary": "Rp5 jt",
                "match": 75,
                "note": "Butuh visa",
                "note_en": "Needs visa",
                "avatar": "",
            },
        ],
        "jobs": [
            {
                "id": "job_001",
                "employerId": "emp_001",
                "title": "Barista",
                "title_en": "Barista",
                "salaryMin": 3000000,
                "salaryMax": 4000000,
                "salaryLabel": "Rp3\u20134 jt/bln",
                "location": "Jakarta Selatan",
                "type": "Penuh waktu",
                "type_en": "Full-time",
                "tags": ["Bisa sambil kuliah"],
                "tags_en": ["Can work while studying"],
                "description": "Membuat kopi, melayani pelanggan, menjaga kebersihan area bar.",
                "description_en": "Make coffee, serve customers and keep the bar area clean.",
                "match": 92,
                "verified": True,
                "posted": "2026-10-20",
                "experience": "Tanpa pengalaman",
                "experience_en": "No experience",
                "education": "SMA/SMK",
                "education_en": "High school",
                "bonus": "THR + bonus bulanan",
                "bonus_en": "THR + monthly bonus",
                "commute": "5 mnt jalan dari MRT",
                "commute_en": "5 min walk from MRT",
                "city": "Jakarta",
                "category": "fnb",
                "applicants": 12,
                "postedAgo": "2 hari lalu",
                "postedAgo_en": "2 days ago",
                "recruiter": {"name": "Bu Sari", "role": "Pemilik", "role_en": "Owner", "online": True, "responseRate": 96},
            },
            {
                "id": "job_002",
                "employerId": "emp_001",
                "title": "Kasir (Part-time)",
                "title_en": "Cashier (Part-time)",
                "salaryMin": 2000000,
                "salaryMax": 2600000,
                "salaryLabel": "Rp2\u20132,6 jt/bln",
                "location": "Jakarta Selatan",
                "type": "Paruh waktu",
                "type_en": "Part-time",
                "tags": ["Shift malam", "Ramah"],
                "tags_en": ["Night shift", "Friendly"],
                "description": "Melayani pembayaran dan rekap transaksi harian.",
                "description_en": "Handle payments and prepare daily transaction reports.",
                "match": 85,
                "verified": True,
                "posted": "2026-10-19",
                "experience": "0-1 tahun",
                "experience_en": "0-1 year",
                "education": "SMA/SMK",
                "education_en": "High school",
                "bonus": "Uang makan",
                "bonus_en": "Meal allowance",
                "commute": "10 mnt dari pusat kota",
                "commute_en": "10 min from city center",
                "city": "Jakarta",
                "category": "fnb",
                "applicants": 8,
                "postedAgo": "1 hari lalu",
                "postedAgo_en": "1 day ago",
                "recruiter": {"name": "Bu Sari", "role": "Pemilik", "role_en": "Owner", "online": True, "responseRate": 96},
            },
            {
                "id": "job_003",
                "employerId": "emp_003",
                "title": "Kurir Motor",
                "title_en": "Motorbike Courier",
                "salaryMin": 3500000,
                "salaryMax": 5000000,
                "salaryLabel": "Rp3,5\u20135 jt/bln",
                "location": "Tangerang",
                "type": "Penuh waktu",
                "type_en": "Full-time",
                "tags": ["Punya motor", "SIM C"],
                "tags_en": ["Owns a motorbike", "Rider's license (SIM C)"],
                "description": "Mengantar paket ke pelanggan sesuai rute aplikasi.",
                "description_en": "Deliver packages to customers following the app route.",
                "match": 78,
                "verified": True,
                "posted": "2026-10-18",
                "experience": "Tanpa pengalaman",
                "experience_en": "No experience",
                "education": "SMA/SMK",
                "education_en": "High school",
                "bonus": "Insentif per paket",
                "bonus_en": "Per-package incentive",
                "commute": "Dari pool Tangerang",
                "commute_en": "From Tangerang hub",
                "city": "Tangerang",
                "category": "logistics",
                "applicants": 34,
                "postedAgo": "3 hari lalu",
                "postedAgo_en": "3 days ago",
                "recruiter": {"name": "Pak Budi", "role": "Manajer Operasional", "role_en": "Operations Manager", "online": False, "responseRate": 88},
            },
            {
                "id": "job_004",
                "employerId": "emp_002",
                "title": "Pramuniaga",
                "title_en": "Sales Associate",
                "salaryMin": 2800000,
                "salaryMax": 3200000,
                "salaryLabel": "Rp2,8\u20133,2 jt/bln",
                "location": "Bandung",
                "type": "Penuh waktu",
                "type_en": "Full-time",
                "tags": ["SMA/SMK", "Komunikatif"],
                "tags_en": ["High school / vocational", "Good communicator"],
                "description": "Menjaga display produk dan membantu pembeli.",
                "description_en": "Maintain the product display and assist shoppers.",
                "match": 70,
                "verified": False,
                "posted": "2026-10-17",
                "experience": "0-1 tahun",
                "experience_en": "0-1 year",
                "education": "SMA/SMK",
                "education_en": "High school",
                "bonus": "\u2014",
                "bonus_en": "\u2014",
                "commute": "Dekat stasiun Bandung",
                "commute_en": "Near Bandung station",
                "city": "Bandung",
                "category": "retail",
                "applicants": 5,
                "postedAgo": "5 hari lalu",
                "postedAgo_en": "5 days ago",
                "recruiter": {"name": "Pak Anton", "role": "Pemilik", "role_en": "Owner", "online": False, "responseRate": 58},
            },
            {
                "id": "job_005",
                "employerId": "emp_004",
                "title": "Pelayan Restoran",
                "title_en": "Restaurant Server",
                "salaryMin": 2500000,
                "salaryMax": 3000000,
                "salaryLabel": "Rp2,5\u20133 jt/bln",
                "location": "Yogyakarta",
                "type": "Penuh waktu",
                "type_en": "Full-time",
                "tags": ["Makan 2x"],
                "tags_en": ["2 meals provided"],
                "description": "Menyajikan pesanan dan melayani tamu.",
                "description_en": "Serve orders and attend to guests.",
                "match": 88,
                "verified": True,
                "posted": "2026-10-16",
                "experience": "Tanpa pengalaman",
                "experience_en": "No experience",
                "education": "SMA/SMK",
                "education_en": "High school",
                "bonus": "Makan 2x + tips",
                "bonus_en": "2 meals + tips",
                "commute": "Pusat kota Yogya",
                "commute_en": "Yogyakarta city center",
                "city": "Yogyakarta",
                "category": "fnb",
                "applicants": 15,
                "postedAgo": "4 hari lalu",
                "postedAgo_en": "4 days ago",
                "recruiter": {"name": "Mas Joko", "role": "Pemilik", "role_en": "Owner", "online": True, "responseRate": 92},
            },
            {
                "id": "job_006",
                "employerId": "emp_003",
                "title": "Admin Gudang",
                "title_en": "Warehouse Admin",
                "salaryMin": 4000000,
                "salaryMax": 4800000,
                "salaryLabel": "Rp4\u20134,8 jt/bln",
                "location": "Tangerang",
                "type": "Penuh waktu",
                "type_en": "Full-time",
                "tags": ["Teliti", "Microsoft Excel"],
                "tags_en": ["Detail-oriented", "Microsoft Excel"],
                "description": "Mencatat stok masuk/keluar dan membuat laporan.",
                "description_en": "Record incoming/outgoing stock and prepare reports.",
                "match": 65,
                "verified": True,
                "posted": "2026-10-15",
                "experience": "1-3 tahun",
                "experience_en": "1-3 years",
                "education": "D3/S1",
                "education_en": "Diploma/Bachelor",
                "bonus": "BPJS + THR",
                "bonus_en": "BPJS + THR",
                "commute": "Kawasan industri",
                "commute_en": "Industrial estate",
                "city": "Tangerang",
                "category": "logistics",
                "applicants": 21,
                "postedAgo": "6 hari lalu",
                "postedAgo_en": "6 days ago",
                "recruiter": {"name": "Pak Budi", "role": "Manajer Operasional", "role_en": "Operations Manager", "online": False, "responseRate": 88},
            },
        ],
        "chats": [
            {
                "id": "chat_001",
                "employerId": "emp_001",
                "jobId": "job_001",
                "unread": 1,
                "tag": "",
                "messages": [
                    {
                        "from": "boss",
                        "text": "Halo Andi, kami lihat profilmu cocok untuk posisi Barista. Tertarik?",
                        "text_en": "Hi Andi, we think your profile fits the Barista role. Interested?",
                        "ts": "2026-10-20T09:10:00Z",
                    },
                    {
                        "from": "me",
                        "text": "Halo Pak/Bu, tertarik! Apakah lokasinya di Jakarta Selatan?",
                        "text_en": "Hi, I'm interested! Is the location in South Jakarta?",
                        "ts": "2026-10-20T09:15:00Z",
                    },
                    {
                        "from": "boss",
                        "text": "Betul, cabang Kemang. Jam kerja 8 jam, 6 hari seminggu. Bisa mulai minggu depan?",
                        "text_en": "Yes, the Kemang outlet. 8-hour shifts, 6 days a week. Can you start next week?",
                        "ts": "2026-10-20T09:22:00Z",
                    },
                ],
            }
        ],
        "saved": ["job_005"],
        "notifications": [
            {
                "id": "n1",
                "type": "chat",
                "text": "Kopi Nusantara membalas chat kamu",
                "text_en": "Kopi Nusantara replied to your chat",
                "ts": "2026-10-20T09:22:00Z",
                "read": False,
            },
            {
                "id": "n2",
                "type": "match",
                "text": "3 lowongan baru cocok dengan profilmu",
                "text_en": "3 new jobs match your profile",
                "ts": "2026-10-20T08:00:00Z",
                "read": True,
            },
        ],
        "filters": {"city": "", "experience": "", "education": "", "salary": "", "type": "", "category": "all"},
        "auth": {"loggedIn": False, "email": "", "name": ""},
        "onboarded": False,
        "lang": "id",
        "accounts": [],
        "queue": [
            {"id": 1, "type": "reply", "subject": "Re: Revised quote timeline",
             "reason": "Client asked for the revised quote. You said you would send it Friday.",
             "source": 'Gmail - thread "Quote for Northwind" - Oct 15',
             "confidence": "Suggested - inferred", "committed": False,
             "snoozed": False, "dismissed": False, "hasDate": True},
            {"id": 2, "type": "reply", "subject": "Design system kickoff",
             "reason": "Meeting invite needs RSVP.",
             "source": "Slack - #design-system - Oct 16",
             "confidence": "Suggested - explicit", "committed": False,
             "snoozed": False, "dismissed": False, "hasDate": False},
            {"id": 3, "type": "commitment", "subject": "Send invoice reminder",
             "reason": "Stated commitment with deadline.",
             "source": "Email - Oct 10",
             "confidence": "Committed - stated", "committed": False,
             "snoozed": False, "dismissed": False, "hasDate": True},
            {"id": 4, "type": "reply", "subject": "Re: Portfolio review feedback",
             "reason": "Direct question requiring response.",
             "source": "Gmail - Oct 17",
             "confidence": "Suggested - inferred", "committed": False,
             "snoozed": False, "dismissed": False, "hasDate": False},
            {"id": 5, "type": "commitment", "subject": "Share sprint retrospective notes",
             "reason": "Team expectation from standup.",
             "source": "Slack - #team - Oct 18",
             "confidence": "Committed - stated", "committed": False,
             "snoozed": False, "dismissed": False, "hasDate": True},
        ],
        "commitments": [
            {"id": 1, "text": "Send revised quote to Northwind",
             "with": "Northwind Studio", "date": "2025-10-20", "status": "open",
             "confidence": "established", "source": "Email - Oct 15"},
            {"id": 2, "text": "Intro Alex to Maria re: design system",
             "with": "Alex Chen, Maria Santos", "date": "\u2014 not stated",
             "status": "open", "confidence": "proposed", "source": "Slack - Oct 16"},
            {"id": 3, "text": "Review Q4 roadmap draft", "with": "Product team",
             "date": "2025-10-18", "status": "done", "confidence": "established",
             "source": "Email - Oct 14"},
            {"id": 4, "text": "Follow up on invoice #2847", "with": "Finance",
             "date": "2025-10-17", "status": "overdue", "confidence": "established",
             "source": "Email - Oct 10"},
            {"id": 5, "text": "Prepare studio visit presentation", "with": "Client",
             "date": "2025-10-25", "status": "open", "confidence": "validation",
             "source": "WhatsApp - Oct 12"},
        ],
        "summaries": [
            {
                "id": 1,
                "title": "Q4 Roadmap Discussion",
                "participants": "Product Team",
                "date": "Oct 14, 2025",
                "mainTopic": "Prioritization of features for Q4 release cycle.",
                "decisions": ["Feature A moved to Q1 2026", "Feature B fast-tracked for November", "Design review scheduled for Oct 22"],
                "openQuestions": ["Resource allocation for Feature B", "Timeline for user testing"],
                "facts": ["Q4 release planned for December 15", "Team capacity at 85%", "Feature A depends on API v2"],
                "guesses": ["Client may request timeline change", "Budget approval might slip"],
                "source": "Slack thread \u00b7 #product-strategy \u00b7 Oct 14",
            },
            {
                "id": 2,
                "title": "Northwind Quote Revision",
                "participants": "You, Maria Santos (Northwind)",
                "date": "Oct 15, 2025",
                "mainTopic": "Revised pricing for the design system project.",
                "decisions": ["10% discount applied for annual contract", "Payment terms: Net 30", "Kickoff call scheduled"],
                "openQuestions": ["Final deliverable format", "Number of revision rounds included"],
                "facts": ["Original quote: $45,000", "Revised quote: $40,500", "Annual contract committed"],
                "guesses": ["Client comparing with other vendors", "May request additional services"],
                "source": "Gmail thread \u00b7 \"Quote for Northwind\" \u00b7 Oct 15",
            },
        ],
        "drafts": [
            {
                "id": 1,
                "recipient": "Maria Santos",
                "subject": "Re: Revised quote timeline",
                "text": "Hi Maria,\n\nThanks for your patience. I've attached the revised quote with the 10% annual discount applied.\n\nKey changes:\n- Total: $40,500 (was $45,000)\n- Payment terms: Net 30\n- Includes 3 revision rounds\n\nLet me know if you have any questions. Ready to kick off whenever you are.\n\nBest,\nAlex",
                "reason": "Responding to quote request with revised pricing.",
                "source": "Gmail \u00b7 thread \"Quote for Northwind\"",
            },
            {
                "id": 2,
                "recipient": "Team",
                "subject": "Re: Design system kickoff",
                "text": "Hey team,\n\nCount me in for the design system kickoff. I've reviewed the initial docs and have a few thoughts:\n\n1. Should we align with Material Design tokens?\n2. Can we schedule weekly syncs?\n3. I can own the documentation piece.\n\nSee you Thursday!\n\n\u2014 Alex",
                "reason": "RSVP to meeting with added context.",
                "source": "Slack \u00b7 #design-system \u00b7 Oct 16",
            },
        ],
        "aura": {
            "workStyle": "Collaborative",
            "strengths": ["Strategic thinking", "Clear communication"],
            "growthEdges": "Delegating earlier when workload increases",
            "archetype": "Indigo",
            "portfolio": [
                {"title": "Senior Product Designer at Northwind Studio",
                 "link": "https://northwind.example", "shared": True},
            ],
            "verificationLevel": "verified",
            "visibility": "public",
        },
        "culture": {
            "workspace": "Northwind Studio",
            "role": "member",
            "rules": [
                {"id": 1, "title": "Working hours",
                 "text": "Core hours are 10:00-16:00. Flexible outside these hours.",
                 "why": "Ensures overlap for collaboration while respecting individual schedules."},
                {"id": 2, "title": "Tone of messages",
                 "text": "Direct but kind. Assume positive intent.",
                 "why": "Reduces ambiguity while maintaining psychological safety."},
                {"id": 3, "title": "Approval steps",
                 "text": "Design decisions need 2 approvals. Code needs 1.",
                 "why": "Balances quality with velocity."},
                {"id": 4, "title": "Quiet-hour defaults",
                 "text": "No notifications 22:00-08:00 unless marked urgent.",
                 "why": "Protects focus time and work-life boundaries."},
            ],
        },
        "growth": {
            "curriculum": [
                {"title": "Product Strategy",
                 "desc": "Market analysis, positioning, roadmap planning",
                 "status": "in progress"},
                {"title": "Leadership Communication",
                 "desc": "Stakeholder management, difficult conversations",
                 "status": "in progress"},
                {"title": "Advanced Data Visualization",
                 "desc": "D3.js, interactive dashboards", "status": "not now"},
            ],
            "keyResults": [
                {"title": "Ship 4 major features this quarter",
                 "baseline": 0, "target": 4, "current": 3},
                {"title": "Reduce meeting time by 30%",
                 "baseline": "20 hrs/wk", "target": "14 hrs", "current": "15.6 hrs"},
            ],
            "sessions": [
                {"id": 1, "date": "2026-10-19", "minutes": 45,
                 "category": "Product Strategy", "output": "Drafted positioning statement",
                 "reflection": "Good focus, lost 10 min on Slack"},
            ],
            "review": {"output": "", "blockers": "", "energy": ""},
            "metrics": [
                {"metric": "Planning time", "baseline": "60 min",
                 "current": "25 min", "change": "-58%"},
                {"metric": "Time to start", "baseline": "3 days",
                 "current": "1 day", "change": "-66%"},
                {"metric": "Completion rate", "baseline": "40%",
                 "current": "75%", "change": "+35 pts"},
                {"metric": "Consistency", "baseline": "2/wk",
                 "current": "4/wk", "change": "+2"},
            ],
        },
        "sources": {"gmail": True, "whatsapp": False, "slack": False},
        "audit": _seed_audit(),
        "settings": {"quietHours": True, "aiPaused": False, "theme": "light"},
    }


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(str(DB_PATH), timeout=10)


def init_db() -> None:
    """Create the tables and seed on first run."""
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "CREATE TABLE IF NOT EXISTS store ("
                "collection TEXT PRIMARY KEY, value TEXT NOT NULL)"
            )
            conn.execute(
                "CREATE TABLE IF NOT EXISTS users ("
                "id INTEGER PRIMARY KEY AUTOINCREMENT, "
                "email TEXT UNIQUE NOT NULL, "
                "password_hash TEXT NOT NULL, "
                "name TEXT NOT NULL, "
                "created TEXT NOT NULL)"
            )
            conn.commit()
            existing = {row[0] for row in conn.execute("SELECT collection FROM store").fetchall()}
        finally:
            conn.close()

    all_keys = [
        "me", "role", "employers", "jobs", "chats", "saved",
        "notifications", "filters", "auth", "onboarded", "lang", "accounts",
        "mode", "applications", "privacy", "vip", "candidates",
        "queue", "commitments", "summaries", "drafts", "aura", "culture",
        "growth", "sources", "audit", "settings",
    ]
    missing = [name for name in all_keys if name not in existing]
    if missing:
        seed_missing(missing)


def seed_all() -> None:
    seeds = build_seed_state()
    with _DB_LOCK:
        conn = _connect()
        try:
            for name, value in seeds.items():
                conn.execute(
                    "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                    (name, json.dumps(value, ensure_ascii=False)),
                )
            conn.commit()
        finally:
            conn.close()


def seed_missing(names) -> None:
    """Insert seed rows only for collections not yet present."""
    seeds = build_seed_state()
    with _DB_LOCK:
        conn = _connect()
        try:
            for name in names:
                conn.execute(
                    "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                    (name, json.dumps(seeds[name], ensure_ascii=False)),
                )
            conn.commit()
        finally:
            conn.close()


def reset_db() -> None:
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute("DELETE FROM store")
            conn.execute("DELETE FROM users")
            conn.commit()
        finally:
            conn.close()
    seed_all()


def get_value(name: str):
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT value FROM store WHERE collection = ?", (name,)
            ).fetchone()
        finally:
            conn.close()
    return json.loads(row[0]) if row else None


def set_value(name: str, value) -> None:
    payload = json.dumps(value, ensure_ascii=False)
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO store(collection, value) VALUES(?, ?)",
                (name, payload),
            )
            conn.commit()
        finally:
            conn.close()


def get_all() -> dict:
    with _DB_LOCK:
        conn = _connect()
        try:
            rows = conn.execute("SELECT collection, value FROM store").fetchall()
        finally:
            conn.close()
    data = {}
    for name, raw in rows:
        data[name] = json.loads(raw)
    return data


def create_user(email: str, password_hash: str, name: str) -> dict:
    with _DB_LOCK:
        conn = _connect()
        try:
            conn.execute(
                "INSERT INTO users(email, password_hash, name, created) VALUES(?, ?, ?, ?)",
                (email, password_hash, name, now_iso()),
            )
            conn.commit()
            row = conn.execute(
                "SELECT id, email, name, created FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        finally:
            conn.close()
    return {"id": row[0], "email": row[1], "name": row[2], "created": row[3]}


def get_user_by_email(email: str):
    with _DB_LOCK:
        conn = _connect()
        try:
            row = conn.execute(
                "SELECT id, email, name, created, password_hash FROM users WHERE email = ?",
                (email,)
            ).fetchone()
        finally:
            conn.close()
    if not row:
        return None
    return {"id": row[0], "email": row[1], "name": row[2], "created": row[3], "password_hash": row[4]}


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def build_state() -> dict:
    return get_all()


# ---------------------------------------------------------------------------
# HTML Injection
# ---------------------------------------------------------------------------


def build_injection_shim(ls_key: str, server_state: dict) -> str:
    """Build the injection script that hydrates localStorage and syncs writes."""
    state_json = json.dumps(server_state, ensure_ascii=False)
    state_json_escaped = state_json.replace('\\', '\\\\').replace('</script>', '<\\/script>')

    shim = f"""<script>
(function(){{
  var KEY={json.dumps(ls_key)};
  var serverState={state_json_escaped};
  if(serverState&&typeof localStorage!=='undefined'){{
    try{{
      localStorage.setItem(KEY,JSON.stringify(serverState));
    }}catch(e){{}}
  }}
  var origSetItem=Storage.prototype.setItem;
  var origRemoveItem=Storage.prototype.removeItem;
  var apiBase=(location.pathname.replace(/[^/]*$/,'')+'api').replace(/\\/+/g,'/');
  Storage.prototype.setItem=function(key,value){{
    origSetItem.call(this,key,value);
    if(key===KEY){{
      fetch(apiBase+'/state',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:value}}).catch(function(){{}});
    }}
  }};
  Storage.prototype.removeItem=function(key){{
    origRemoveItem.call(this,key);
    if(key===KEY){{
      fetch(apiBase+'/state',{{method:'PUT',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{}})}}).catch(function(){{}});
    }}
  }};
}})();
</script>"""
    return shim


def inject_html(content: str, ls_key: str, server_state: dict) -> str:
    """Inject the shim script before the first <script tag."""
    shim = build_injection_shim(ls_key, server_state)
    match = re.search(r'<script', content, re.IGNORECASE)
    if match:
        return content[:match.start()] + shim + content[match.start():]
    return shim + content


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------


class OrbisWorkHandler(BaseHTTPRequestHandler):
    server_version = "OrbisWork/1.0"
    protocol_version = "HTTP/1.1"

    def _send_bytes(self, status, body: bytes, content_type, extra=None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        if extra:
            for key, value in extra.items():
                self.send_header(key, value)
        self.end_headers()
        if self.command != "HEAD":
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

    def send_json(self, status, obj, extra=None) -> None:
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        headers = {"Cache-Control": "no-store"}
        if extra:
            headers.update(extra)
        self._send_bytes(status, body, "application/json; charset=utf-8", headers)

    def send_error_json(self, status, message) -> None:
        self.send_json(status, {"error": message})

    def _read_body(self):
        length = self.headers.get("Content-Length")
        if not length:
            return b""
        try:
            size = int(length)
        except (TypeError, ValueError):
            return b""
        if size <= 0:
            return b""
        return self.rfile.read(size)

    def _parse_body_json(self):
        raw = self._read_body()
        if not raw:
            return False, "request body is empty"
        try:
            return True, json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return False, "malformed JSON body"

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header(
            "Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS"
        )
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_HEAD(self):
        self._route("GET")

    def do_GET(self):
        self._route("GET")

    def do_PUT(self):
        self._route("PUT")

    def do_POST(self):
        self._route("POST")

    def do_DELETE(self):
        self.send_error_json(404, "not found")

    def _route(self, method):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            self._handle_api(method, path[len("/api/"):])
        elif path == "/api":
            self.send_error_json(404, "not found")
        else:
            self._serve_static(path, method)

    def _handle_api(self, method, rest):
        segments = [seg for seg in rest.split("/") if seg]
        if not segments:
            self.send_error_json(404, "not found")
            return
        name = segments[0]

        if method == "GET":
            self._api_get(name, segments[1:] if len(segments) > 1 else None)
        elif method == "PUT":
            self._api_put(name)
        elif method == "POST":
            self._api_post(name)
        else:
            self.send_error_json(404, "not found")

    def _api_get(self, name, subpath):
        if name == "health":
            self.send_json(200, {"status": "ok", "app": APP_NAME, "version": APP_VERSION})
            return
        if name == "state":
            self.send_json(200, build_state())
            return
        if name == "users" and subpath and subpath[0] == "me":
            self.send_json(200, {"ok": True, "user": None})
            return
        self.send_error_json(404, "unknown endpoint")

    def _api_put(self, name):
        if name == "state":
            ok, value = self._parse_body_json()
            if not ok:
                self.send_error_json(400, value)
                return
            if not isinstance(value, dict):
                self.send_error_json(400, "state must be a JSON object")
                return
            for k, v in value.items():
                set_value(k, v)
            self.send_json(200, {"ok": True})
            return
        self.send_error_json(404, "not found")

    def _api_post(self, name):
        if name == "reset":
            reset_db()
            self.send_json(200, {"ok": True})
            return
        if name == "auth":
            ok, body = self._parse_body_json()
            if not ok:
                self.send_error_json(400, body)
                return
            action = body.get("action") if isinstance(body, dict) else None
            if action == "signup":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                name = body.get("name", "").strip() or email.split("@")[0]
                if not email or "@" not in email:
                    self.send_error_json(400, "invalid email")
                    return
                if len(password) < 6:
                    self.send_error_json(400, "password too short")
                    return
                import hashlib
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                try:
                    user = create_user(email, pw_hash, name)
                    self.send_json(200, {"ok": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}})
                except sqlite3.IntegrityError:
                    self.send_error_json(400, "email already exists")
                return
            if action == "signin":
                email = body.get("email", "").strip().lower()
                password = body.get("password", "")
                if not email or not password:
                    self.send_error_json(400, "email and password required")
                    return
                import hashlib
                pw_hash = hashlib.sha256(password.encode()).hexdigest()
                user = get_user_by_email(email)
                if user and user["password_hash"] == pw_hash:
                    self.send_json(200, {"ok": True, "user": {"id": user["id"], "email": user["email"], "name": user["name"]}})
                else:
                    self.send_error_json(401, "invalid credentials")
                return
            if action == "logout":
                self.send_json(200, {"ok": True})
                return
            self.send_error_json(400, "unknown auth action")
            return
        self.send_error_json(404, "not found")

    def _serve_static(self, path, method):
        if path in ("", "/"):
            rel = "index.html"
        else:
            rel = unquote(path).lstrip("/")

        first = rel.replace("\\", "/").split("/", 1)[0]
        if first == "data":
            self.send_error_json(404, "not found")
            return

        try:
            target = (WEB_DIR / rel).resolve()
            target.relative_to(WEB_DIR)
        except ValueError:
            self.send_error_json(404, "not found")
            return

        if not target.is_file():
            self.send_error_json(404, "not found")
            return

        content_type = CONTENT_TYPES.get(
            target.suffix.lower(), "application/octet-stream"
        )

        body = target.read_bytes()

        if rel == "app.html":
            state = build_state()
            html_content = body.decode("utf-8")
            injected = inject_html(html_content, LS_KEY_INDEX, state)
            body = injected.encode("utf-8")
            content_type = "text/html; charset=utf-8"
        elif rel == "app-mobile.html":
            state = build_state()
            html_content = body.decode("utf-8")
            injected = inject_html(html_content, LS_KEY_MOBILE, state)
            body = injected.encode("utf-8")
            content_type = "text/html; charset=utf-8"

        self._send_bytes(200, body, content_type, {"Cache-Control": "no-cache"})

    def log_message(self, fmt, *args):
        print("[orbiswork] %s - %s" % (self.address_string(), fmt % args))


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="OrbisWork prototype server")
    parser.add_argument("--port", type=int, default=8765,
                        help="port to listen on (default 8792)")
    parser.add_argument("--host", default="127.0.0.1",
                        help="host to bind (default 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true",
                        help="do not open a browser window on start")
    args = parser.parse_args()

    init_db()

    httpd = ThreadingHTTPServer((args.host, args.port), OrbisWorkHandler)
    httpd.daemon_threads = True
    url = "http://%s:%d/" % (args.host, args.port)

    print("OrbisWork prototype server")
    print("  serving: %s" % WEB_DIR)
    print("  database: %s" % DB_PATH)
    print("  url: %s" % url)
    print("  press Ctrl+C to stop")

    if not args.no_browser:
        try:
            webbrowser.open(url)
        except Exception:
            pass

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[orbiswork] shutting down")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
