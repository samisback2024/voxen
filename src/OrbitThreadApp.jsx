/**
 * ============================================================
 * ORBIT THREAD  ·  Phase 1 v3
 * ============================================================
 *
 * DESIGN PHILOSOPHY THIS VERSION:
 * "Human-crafted warmth" — feels like a premium notebook,
 * not a cold SaaS dashboard. Warm dark tones (#1A1410),
 * organic typography (Plus Jakarta Sans + Lora), breathing
 * whitespace, soft glows, and interactions that feel physical.
 *
 * WHAT CHANGED FROM v2:
 * ✦ Entire color system rebuilt — warm charcoal, not cold blue-black
 * ✦ Typography: Plus Jakarta Sans (warm, friendly) + Lora (literary serif)
 * ✦ Connection system: full Request → Pending → Accept/Decline flow
 * ✦ Notification center shows pending requests with action buttons
 * ✦ Chat/Call locked until both users accept the connection
 * ✦ Softer radii, warmer shadows, organic hover states
 * ✦ Subtle noise texture on surfaces for depth
 * ✦ Staggered animations — feels physical, not digital
 *
 * TECH NOTE FOR YOUR RESUME:
 * The connection state machine here has 3 states:
 *   "none"     → no connection (can send request)
 *   "pending"  → request sent, waiting for acceptance
 *   "accepted" → both can chat & call
 * This mirrors how real social apps (Facebook, LinkedIn) work.
 * In Phase 2 this maps to a Supabase `connections` table with
 * status column: 'pending' | 'accepted' | 'declined'
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabase";
import { useConversations } from "./hooks/useConversations";
import { useDirectMessages } from "./hooks/useDirectMessages";
import { useSendDirectMessage } from "./hooks/useSendDirectMessage";
import { createConversation } from "./lib/dm";

// ── Profanity filter (same as v2, explained there) ──────────
const BANNED = ["fuck","shit","ass","bitch","bastard","crap","piss","dick","cock","pussy","nigger","nigga","faggot","whore","slut","cunt","motherfucker","asshole","douchebag","bullshit","wanker","twat"];
const hasProfanity = t => BANNED.some(w => new RegExp(`\\b${w}\\b`,"i").test(t));

// ── Status constants ─────────────────────────────────────────
const S = { ONLINE:"online", AWAY:"away", OFFLINE:"offline" };
const SC = { online:"#4ADE80", away:"#FBBF24", offline:"#F87171" };
const SL = { online:"Online now", away:"Last seen recently", offline:"Offline" };

// ── Connection states ────────────────────────────────────────
// This is the core new feature — 3-state connection machine
// none → pending (you sent) → accepted
// none → incoming (they sent you) → accepted / declined
const CS = { NONE:"none", PENDING_SENT:"pending_sent", PENDING_INCOMING:"pending_incoming", ACCEPTED:"accepted" };

const ALL_TOPICS = [
  "Systems Design","Product Management","Venture Capital","Biotech","Philosophy",
  "Urban Planning","Macroeconomics","AI Research","Renewable Energy","Cognitive Science",
  "Fintech","SaaS Architecture","Quantum Computing","Climate Tech","Geopolitics",
  "Neuroscience","Blockchain","Education Reform","Healthcare Innovation","Space Exploration",
  "Cryptography","Constitutional Law","Behavioral Economics","Machine Learning","Ethics",
  "Supply Chain","Deep Tech","Public Policy","Data Science","Future of Work",
  "Robotics","Web3","Mental Health Tech","Longevity Research","Nuclear Energy",
  "Open Source","Linguistics","Architecture","Design Systems","Material Science",
  "Game Theory","Economics","Psychology","Anthropology","Astrophysics",
  "Genomics","Cybersecurity","DevOps","Cloud Computing","UX Research",
  "Photography","Music Theory","History","Literature","Nutrition Science",
];

const DEMO_USERS = [
  { id:"u1", name:"Alex Chen",   handle:"@alexchen",  status:S.ONLINE,  initials:"AC", hue:"210,120,255", expertise:["AI Research","Systems Design"],     bio:"ML engineer building at the frontier." },
  { id:"u2", name:"Maya Patel",  handle:"@mayapatel", status:S.AWAY,    initials:"MP", hue:"340,180,120", expertise:["Biotech","Genomics"],               bio:"PhD researcher. Protein folding nerd." },
  { id:"u3", name:"Jordan Lee",  handle:"@jordanlee", status:S.OFFLINE, initials:"JL", hue:"160,200,100", expertise:["Fintech","Behavioral Economics"],   bio:"Building fair financial infrastructure." },
  { id:"u4", name:"Sam Kim",     handle:"@samkim",    status:S.ONLINE,  initials:"SK", hue:"35,220,180",  expertise:["Product Management","UX Research"], bio:"0→1 product person. Love hard problems." },
];

// ── Avatar gradient from hue string ─────────────────────────
const avatarGrad = (hue) => {
  const [h1, s, l] = hue.split(",").map(Number);
  return `linear-gradient(135deg, hsl(${h1},${s}%,${l+10}%), hsl(${h1+40},${s+10}%,${l-5}%))`;
};

// ── Haversine formula — distance in miles between two GPS points ──
const haversineMiles = (lat1, lon1, lat2, lon2) => {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ── Geo-radius options for public rooms ──────────────────────
const RADIUS_OPTIONS = [
  { label:"1 mile",     value:1 },
  { label:"5 miles",    value:5 },
  { label:"25 miles",   value:25 },
  { label:"100 miles",  value:100 },
  { label:"My City",    value:50 },
  { label:"My Country", value:3000 },
  { label:"Worldwide",  value:99999 },
];

// ── Seed public rooms for Discover tab ───────────────────────
const SEED_ROOMS = [
  { id:"sr1", name:"AI Ethics Roundtable",   desc:"Debating the moral boundaries of artificial intelligence.",       type:"public", creatorName:"Alex Chen",    memberCount:24, topic:"AI Research",       radius:99999, lat:37.77,  lng:-122.42 },
  { id:"sr2", name:"Climate Action Now",      desc:"Practical steps for climate tech adoption.",                      type:"public", creatorName:"Maya Patel",   memberCount:31, topic:"Climate Tech",      radius:100,   lat:40.71,  lng:-74.01  },
  { id:"sr3", name:"Philosophy of Mind",      desc:"Consciousness, qualia, and the hard problem.",                    type:"public", creatorName:"Jordan Lee",   memberCount:18, topic:"Philosophy",        radius:99999, lat:51.51,  lng:-0.13   },
  { id:"sr4", name:"DeFi Deep Dive",          desc:"Exploring decentralized finance protocols.",                      type:"public", creatorName:"Sam Kim",      memberCount:42, topic:"Fintech",           radius:25,    lat:34.05,  lng:-118.24 },
  { id:"sr5", name:"Quantum Computing 101",   desc:"From qubits to quantum supremacy, beginner-friendly.",           type:"public", creatorName:"Priya Sharma", memberCount:15, topic:"Quantum Computing", radius:99999, lat:48.86,  lng:2.35    },
  { id:"sr6", name:"Urban Futures",           desc:"How cities can be redesigned for people.",                        type:"public", creatorName:"Liam O'Brien", memberCount:27, topic:"Urban Planning",    radius:50,    lat:41.88,  lng:-87.63  },
  { id:"sr7", name:"Biotech Breakthroughs",   desc:"CRISPR, gene therapy, and the future of medicine.",              type:"public", creatorName:"Ayumi Tanaka", memberCount:33, topic:"Biotech",           radius:99999, lat:35.68,  lng:139.69  },
  { id:"sr8", name:"Space Economy",           desc:"Commercial space ventures and the next frontier.",                type:"public", creatorName:"Carlos Mendez",memberCount:21, topic:"Space Exploration", radius:99999, lat:28.57,  lng:-80.65  },
];

// ── DM_REPLIES removed — DMs are now fully persistent via Supabase ──

// ── Discover topic filters ───────────────────────────────────
const DISCOVER_TOPICS = ["All","AI Research","Climate Tech","Philosophy","Fintech","Quantum Computing","Urban Planning","Biotech","Space Exploration","Geopolitics","Neuroscience"];

// ════════════════════════════════════════════════════════════
// DESIGN SYSTEM — Warm Human Aesthetic
// Key decisions:
//   Background: #120F0C (warm charcoal — like a lit fireplace room)
//   Surfaces:   slightly warm-tinted darks, not blue-grey
//   Accent:     #E8845A (warm terracotta) paired with #6B9EFF (soft sky)
//   Typography: Plus Jakarta Sans for UI + Lora for headings (literary feel)
//   Borders:    very subtle, warm-tinted
//   Shadows:    warm-tinted, spread wide — feels physical
// ════════════════════════════════════════════════════════════
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=Lora:ital,wght@0,400;0,600;0,700;1,400&display=swap');

  *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }

  :root {
    /* ── Warm Charcoal Palette ── */
    --ink:     #120F0C;   /* Deepest bg — warm charcoal, not cold black */
    --base:    #1C1814;   /* Primary surfaces */
    --surf:    #252119;   /* Cards, panels */
    --raised:  #2E291F;   /* Inputs, secondary */
    --overlay: #38322A;   /* Dropdowns, tooltips */
    --rim:     #44403A;   /* Borders — warm grey */

    --b0: rgba(255,240,220,0.04);  /* Very subtle warm border */
    --b1: rgba(255,240,220,0.08);
    --b2: rgba(255,240,220,0.13);
    --b3: rgba(255,240,220,0.20);

    /* ── Text Scale ── */
    --t0: #F0EAE0;   /* Primary — warm white */
    --t1: #9E9080;   /* Secondary */
    --t2: #5C5448;   /* Muted */

    /* ── Accent Colors ── */
    --clay:  #E8845A;   /* Warm terracotta — primary CTA */
    --clay2: #D4693D;   /* Darker clay */
    --sky:   #6B9EFF;   /* Soft sky blue — secondary */
    --sage:  #5CB882;   /* Sage green — success / online */
    --amber: #F5A623;   /* Warm amber — away status */
    --rose:  #E85A6B;   /* Rose red — danger / offline */
    --gold:  #D4A853;   /* Antique gold — private rooms */

    --clay-glow: rgba(232,132,90,0.15);
    --sky-glow:  rgba(107,158,255,0.12);

    /* ── Typography ── */
    --hf: 'Lora', Georgia, serif;          /* Headings — literary, warm */
    --bf: 'Plus Jakarta Sans', sans-serif; /* Body — friendly, clear */

    /* ── Radii ── (slightly softer than v2) */
    --r4:4px; --r6:6px; --r8:8px; --r10:10px;
    --r12:12px; --r14:14px; --r16:16px; --r20:20px; --r24:24px; --r99:999px;

    /* ── Shadows ── (warm-tinted) */
    --sh-sm: 0 2px 8px rgba(18,15,12,0.4);
    --sh-md: 0 8px 28px rgba(18,15,12,0.5);
    --sh-lg: 0 16px 52px rgba(18,15,12,0.65);
  }

  html, body, #root { height:100%; }
  body {
    background:
      radial-gradient(1100px 450px at 20% -8%, rgba(232,132,90,0.14), transparent 55%),
      radial-gradient(800px 380px at 85% -12%, rgba(107,158,255,0.11), transparent 52%),
      radial-gradient(600px 300px at 50% 110%, rgba(92,184,130,0.06), transparent 60%),
      linear-gradient(135deg, #120F0C 0%, #16120E 50%, #120F0C 100%);
    background-size:200% 200%, 200% 200%, 100% 100%, 100% 100%;
    animation:aurora 25s ease infinite;
    color:var(--t0); font-family:var(--bf);
    font-size:14px; line-height:1.6; letter-spacing:0.004em;
    -webkit-font-smoothing:antialiased;
  }

  /* Subtle noise texture on all surfaces — makes it feel hand-made */
  body::before {
    content:''; position:fixed; inset:0; pointer-events:none; z-index:1000;
    opacity:0.025;
    background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  ::-webkit-scrollbar { width:5px; }
  ::-webkit-scrollbar-track { background:transparent; }
  ::-webkit-scrollbar-thumb { background:linear-gradient(180deg, var(--clay), var(--sky)); border-radius:4px; opacity:0.6; }
  ::-webkit-scrollbar-thumb:hover { opacity:1; }

  /* ════════════════════════════════
     KEYFRAMES
  ════════════════════════════════ */
  @keyframes fadeUp   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn   { from{opacity:0} to{opacity:1} }
  @keyframes popIn    { from{opacity:0;transform:scale(0.95) translateY(8px)} to{opacity:1;transform:scale(1) translateY(0)} }
  @keyframes slideIn  { from{opacity:0;transform:translateX(12px)} to{opacity:1;transform:translateX(0)} }
  @keyframes pulse    { 0%,100%{opacity:1} 50%{opacity:0.45} }
  @keyframes shimmer  { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes toastUp  { from{opacity:0;transform:translateX(-50%) translateY(10px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes toastOut { to{opacity:0;transform:translateX(-50%) translateY(6px)} }
  @keyframes shake    { 0%,100%{transform:translateX(0)} 20%,60%{transform:translateX(-4px)} 40%,80%{transform:translateX(4px)} }
  @keyframes bounce   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
  @keyframes aurora     { 0%{background-position:0% 50%} 50%{background-position:100% 50%} 100%{background-position:0% 50%} }
  @keyframes borderGlow { 0%{opacity:0.4} 50%{opacity:1} 100%{opacity:0.4} }
  @keyframes logoBreath { 0%,100%{box-shadow:0 4px 16px rgba(232,132,90,0.3)} 50%{box-shadow:0 8px 30px rgba(232,132,90,0.55)} }
  @keyframes float      { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  @keyframes tabSlide   { from{width:0;opacity:0} to{width:100%;opacity:1} }

  /* ════════════════════════════════
     LAYOUT
  ════════════════════════════════ */
  .app {
    display:flex; flex-direction:column; overflow:hidden;
    width:min(1460px, calc(100% - 30px)); height:calc(100vh - 30px);
    margin:15px auto; border-radius:22px;
    background:rgba(18,15,12,0.78); backdrop-filter:blur(20px) saturate(1.3);
    box-shadow:
      0 30px 80px rgba(18,15,12,0.55),
      0 1px 0 rgba(255,240,220,0.06) inset,
      0 0 0 1px rgba(255,240,220,0.06);
    position:relative; isolation:isolate;
  }
  .app::before {
    content:''; position:absolute; inset:-1px; pointer-events:none; z-index:-1;
    border-radius:23px; padding:1px;
    background:linear-gradient(160deg, rgba(232,132,90,0.35), transparent 40%, transparent 60%, rgba(107,158,255,0.25));
    -webkit-mask:linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite:xor;
    mask-composite:exclude;
    animation:borderGlow 4s ease-in-out infinite;
  }
  .app::after {
    content:''; position:absolute; inset:0; pointer-events:none; z-index:0;
    border-radius:22px;
    background:
      radial-gradient(700px 260px at 10% 0%, rgba(255,240,220,0.035), transparent 55%),
      radial-gradient(500px 220px at 85% 100%, rgba(232,132,90,0.05), transparent 60%);
  }
  .layout { display:flex; flex:1; overflow:hidden; }
  .main   { flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0; }

  /* ════════════════════════════════
     SIDEBAR
  ════════════════════════════════ */
  .sidebar {
    width:234px; min-width:234px;
    background:linear-gradient(180deg, rgba(28,24,20,0.96), rgba(18,15,12,0.96));
    border-right:1px solid var(--b1); display:flex; flex-direction:column;
    overflow:hidden;
  }
  .sb-brand {
    padding:18px 16px 14px; border-bottom:1px solid var(--b0);
    display:flex; align-items:center; gap:10px;
  }
  .sb-logomark {
    width:32px; height:32px; border-radius:10px; flex-shrink:0;
    background:linear-gradient(135deg,var(--clay),#C4624A);
    display:flex; align-items:center; justify-content:center;
    font-family:var(--hf); font-weight:700; font-size:13px; color:#fff;
    letter-spacing:0.02em;
    animation:logoBreath 3s ease-in-out infinite;
    transition:transform 0.3s cubic-bezier(0.22,1,0.36,1);
  }
  .sb-logomark:hover { transform:scale(1.08) rotate(-3deg); }
  .sb-wordmark { line-height:1.15; }
  .sb-wordmark-name { font-family:var(--hf); font-weight:700; font-size:17px; letter-spacing:0.01em; }
  .sb-wordmark-tag  { font-size:10px; color:var(--t2); margin-top:1px; }

  .sb-sect {
    display:flex; align-items:center; justify-content:space-between;
    padding:14px 14px 5px; font-size:10px; font-weight:700;
    letter-spacing:0.09em; text-transform:uppercase; color:var(--t2);
  }
  .sb-plus {
    background:none; border:none; color:var(--t2); cursor:pointer;
    width:22px; height:22px; border-radius:6px; display:flex;
    align-items:center; justify-content:center; font-size:17px; font-weight:300;
    transition:all 0.14s;
  }
  .sb-plus:hover { color:var(--t0); background:var(--raised); }

  .sb-item {
    display:flex; align-items:center; gap:9px; padding:8px 12px;
    margin:1px 8px; border-radius:var(--r10); cursor:pointer;
    color:var(--t1); font-size:13px; font-weight:500; transition:all 0.14s;
    position:relative;
  }
  .sb-item:hover { background:var(--surf); color:var(--t0); }
  .sb-item.active { background:rgba(232,132,90,0.1); color:var(--t0); box-shadow:0 0 18px rgba(232,132,90,0.06); }
  .sb-item.active::before {
    content:''; position:absolute; left:-8px; top:50%; transform:translateY(-50%);
    width:3px; height:50%; border-radius:2px;
    background:linear-gradient(180deg, var(--clay), var(--sky));
    box-shadow:0 0 10px rgba(232,132,90,0.4);
  }
  .sb-rdot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .rdot-pub  { background:var(--sage); box-shadow:0 0 6px rgba(92,184,130,0.5); }
  .rdot-priv { background:var(--gold); box-shadow:0 0 6px rgba(212,168,83,0.4); }
  .sb-iname  { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sb-hint   { padding:8px 16px; font-size:11px; color:var(--t2); line-height:1.6; font-style:italic; }

  /* Pending badge on sidebar connections */
  .pending-pill {
    padding:1px 6px; background:rgba(232,132,90,0.15); border:1px solid rgba(232,132,90,0.3);
    border-radius:var(--r99); font-size:9px; font-weight:700; color:var(--clay);
    text-transform:uppercase; letter-spacing:0.05em;
  }

  .sb-footer { margin-top:auto; padding:10px; border-top:1px solid var(--b0); }
  .sb-user {
    display:flex; align-items:center; gap:9px; padding:9px 8px;
    border-radius:var(--r12); cursor:pointer; transition:background 0.14s;
  }
  .sb-user:hover { background:var(--surf); }
  .sb-uname   { font-size:13px; font-weight:600; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sb-uhandle { font-size:11px; color:var(--t2); }
  .sb-gear    { background:none; border:none; color:var(--t2); cursor:pointer; font-size:15px; padding:4px 5px; border-radius:6px; transition:color 0.13s; }
  .sb-gear:hover { color:var(--t0); }

  /* ════════════════════════════════
     AVATAR + STATUS PIP
  ════════════════════════════════ */
  .av {
    border-radius:50%; display:flex; align-items:center; justify-content:center;
    font-weight:700; color:#fff; flex-shrink:0; position:relative;
  }
  .av-xs { width:26px; height:26px; font-size:10px; }
  .av-sm { width:32px; height:32px; font-size:12px; }
  .av-md { width:40px; height:40px; font-size:15px; }
  .av-lg { width:56px; height:56px; font-size:21px; }
  .av-xl { width:76px; height:76px; font-size:29px; }

  .pip {
    position:absolute; border-radius:50%; border:2px solid var(--base);
  }
  .pip-sm { width:9px; height:9px; bottom:0; right:0; }
  .pip-md { width:11px; height:11px; bottom:0; right:0; }
  .pip-lg { width:14px; height:14px; bottom:2px; right:2px; }

  /* ════════════════════════════════
     TOPBAR
  ════════════════════════════════ */
  .topbar {
    height:54px;
    background:linear-gradient(180deg, rgba(28,24,20,0.94), rgba(18,15,12,0.92));
    border-bottom:1px solid var(--b0);
    display:flex; align-items:center; padding:0 18px; gap:13px;
    position:relative; flex-shrink:0; z-index:20;
  }
  .tb-crumb {
    font-family:var(--hf); font-size:15px; font-weight:600;
    display:flex; align-items:center; gap:8px; white-space:nowrap;
  }
  .tb-live { width:7px; height:7px; border-radius:50%; background:var(--sage); animation:pulse 2.4s ease infinite; }

  /* Search */
  .srch-wrap { flex:1; max-width:400px; position:relative; }
  .srch-el {
    width:100%; padding:9px 13px 9px 36px;
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r10); color:var(--t0); font-family:var(--bf);
    font-size:13px; outline:none; transition:all 0.18s;
  }
  .srch-el:focus { border-color:var(--clay); background:var(--raised); box-shadow:0 0 0 3px var(--clay-glow); }
  .srch-el::placeholder { color:var(--t2); }
  .srch-ico { position:absolute; left:11px; top:50%; transform:translateY(-50%); color:var(--t2); pointer-events:none; }

  .srch-drop {
    position:absolute; top:calc(100% + 6px); left:0; right:0;
    background:var(--base); border:1px solid var(--b2);
    border-radius:var(--r14); overflow:hidden; z-index:100;
    box-shadow:var(--sh-lg); animation:fadeUp 0.16s ease;
  }
  .sd-item {
    display:flex; align-items:center; gap:10px; padding:10px 14px;
    cursor:pointer; color:var(--t1); transition:background 0.1s; border-bottom:1px solid var(--b0);
  }
  .sd-item:last-child { border-bottom:none; }
  .sd-item:hover { background:var(--surf); color:var(--t0); }
  .sd-ico  { font-size:14px; flex-shrink:0; }
  .sd-info { flex:1; min-width:0; }
  .sd-name { font-size:13px; font-weight:500; }
  .sd-sub  { font-size:11px; color:var(--t2); margin-top:1px; }
  .sd-badge { padding:2px 8px; border-radius:var(--r99); font-size:10px; font-weight:700; letter-spacing:0.04em; flex-shrink:0; }
  .sdb-room   { background:rgba(107,158,255,0.1); color:var(--sky); }
  .sdb-person { background:rgba(92,184,130,0.1); color:var(--sage); }
  .sd-empty { padding:16px; font-size:12px; color:var(--t2); text-align:center; font-style:italic; }

  /* Topbar right */
  .tb-right { margin-left:auto; display:flex; align-items:center; gap:7px; }
  .ico-btn {
    width:36px; height:36px; border-radius:10px;
    background:rgba(37,33,25,0.8); border:1px solid var(--b1);
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--t1); font-size:16px;
    transition:all 0.2s cubic-bezier(0.22,1,0.36,1); position:relative;
  }
  .ico-btn:hover {
    background:rgba(232,132,90,0.1); color:var(--clay);
    border-color:rgba(232,132,90,0.3);
    box-shadow:0 0 12px rgba(232,132,90,0.1);
    transform:translateY(-1px);
  }
  .notif-pip {
    position:absolute; top:-4px; right:-4px; min-width:17px; height:17px;
    background:var(--rose); border-radius:var(--r99); border:2px solid var(--base);
    font-size:9px; font-weight:800; display:flex; align-items:center;
    justify-content:center; padding:0 3px; color:#fff;
    box-shadow:0 0 8px rgba(232,90,107,0.5);
    animation:bounce 0.4s ease, pulse 2s ease-in-out infinite;
  }

  /* ════════════════════════════════
     NOTIFICATION PANEL
  ════════════════════════════════ */
  .notif-panel {
    position:fixed; right:10px; top:60px; width:360px;
    background:var(--base); border:1px solid var(--b2);
    border-radius:var(--r16); z-index:300; overflow:hidden;
    box-shadow:var(--sh-lg); animation:fadeUp 0.18s ease;
  }
  .np-head {
    padding:14px 16px; border-bottom:1px solid var(--b1);
    display:flex; align-items:center; justify-content:space-between;
  }
  .np-head h4 { font-family:var(--hf); font-size:15px; font-weight:600; }
  .np-clear { background:none; border:none; color:var(--clay); font-size:12px; cursor:pointer; font-family:var(--bf); }
  .np-empty { padding:36px 20px; text-align:center; }
  .np-empty-ico  { font-size:30px; opacity:0.35; margin-bottom:10px; }
  .np-empty-text { font-size:12px; color:var(--t2); line-height:1.7; font-style:italic; }
  .np-item {
    display:flex; gap:11px; padding:12px 16px; border-bottom:1px solid var(--b0);
    cursor:pointer; transition:background 0.1s;
  }
  .np-item:last-child { border-bottom:none; }
  .np-item:hover { background:var(--surf); }
  .np-item.unread { background:rgba(232,132,90,0.04); }
  .np-dot { width:7px; height:7px; border-radius:50%; background:var(--clay); flex-shrink:0; margin-top:5px; }
  .np-dot.read { background:transparent; }
  .np-body { flex:1; }
  .np-text { font-size:13px; color:var(--t1); line-height:1.55; }
  .np-text strong { color:var(--t0); font-weight:600; }
  .np-time { font-size:11px; color:var(--t2); margin-top:3px; }

  /* Connection request notification actions */
  .np-actions { display:flex; gap:7px; margin-top:9px; }
  .np-accept {
    padding:6px 14px; background:var(--clay); border:none;
    border-radius:var(--r8); color:#fff; font-family:var(--bf);
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .np-accept:hover { background:var(--clay2); transform:translateY(-1px); }
  .np-decline {
    padding:6px 12px; background:var(--raised); border:1px solid var(--b2);
    border-radius:var(--r8); color:var(--t1); font-family:var(--bf);
    font-size:12px; font-weight:500; cursor:pointer; transition:all 0.14s;
  }
  .np-decline:hover { color:var(--rose); border-color:rgba(232,90,107,0.3); }

  /* ════════════════════════════════
     BUTTONS
  ════════════════════════════════ */
  .btn-primary {
    display:inline-flex; align-items:center; gap:7px;
    padding:11px 22px;
    background:linear-gradient(135deg, var(--clay) 0%, #D46A42 100%);
    border:none;
    border-radius:var(--r12); color:#fff; font-family:var(--bf);
    font-size:14px; font-weight:600; cursor:pointer; letter-spacing:0.01em;
    transition:all 0.22s cubic-bezier(0.22,1,0.36,1);
    box-shadow:0 4px 16px rgba(232,132,90,0.25);
    position:relative; overflow:hidden;
  }
  .btn-primary::before {
    content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
    transition:left 0.5s;
  }
  .btn-primary:hover::before { left:100%; }
  .btn-primary:hover { background:linear-gradient(135deg,#D46A42,var(--clay)); transform:translateY(-2px); box-shadow:0 8px 28px rgba(232,132,90,0.45); }
  .btn-primary:disabled { opacity:0.35; cursor:not-allowed; transform:none; box-shadow:none; }
  .btn-primary.full { width:100%; justify-content:center; }

  .btn-ghost {
    display:inline-flex; align-items:center; gap:7px;
    padding:9px 18px; background:var(--surf); border:1px solid var(--b2);
    border-radius:var(--r12); color:var(--t0); font-family:var(--bf);
    font-size:13px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .btn-ghost:hover { background:var(--raised); border-color:var(--b3); }

  .btn-danger {
    display:inline-flex; align-items:center; gap:7px;
    padding:9px 18px; background:transparent; border:1px solid rgba(232,90,107,0.25);
    border-radius:var(--r12); color:var(--rose); font-family:var(--bf);
    font-size:13px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .btn-danger:hover { background:rgba(232,90,107,0.07); }

  /* ════════════════════════════════
     MODALS
  ════════════════════════════════ */
  .overlay {
    position:fixed; inset:0; background:rgba(12,10,8,0.78);
    backdrop-filter:blur(12px); z-index:300;
    display:flex; align-items:center; justify-content:center;
    padding:20px; animation:fadeIn 0.15s ease;
  }
  .modal {
    background:var(--base); border:1px solid var(--b2);
    border-radius:var(--r20); padding:28px; width:100%; max-width:480px;
    max-height:90vh; overflow-y:auto; box-shadow:var(--sh-lg);
    animation:popIn 0.22s ease;
  }
  .modal-head { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:22px; }
  .modal-head h3 { font-family:var(--hf); font-size:19px; font-weight:600; line-height:1.3; }
  .modal-x { background:none; border:none; color:var(--t2); cursor:pointer; font-size:19px; padding:3px 6px; border-radius:6px; transition:color 0.13s; flex-shrink:0; }
  .modal-x:hover { color:var(--t0); }
  .modal-foot { display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-top:22px; padding-top:18px; border-top:1px solid var(--b1); }

  /* Form fields */
  .field { margin-bottom:17px; }
  .fl { font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--t2); margin-bottom:8px; }
  .fi {
    width:100%; padding:11px 14px; background:var(--surf);
    border:1px solid var(--b1); border-radius:var(--r12);
    color:var(--t0); font-family:var(--bf); font-size:14px; outline:none;
    transition:all 0.16s;
  }
  .fi:focus { border-color:var(--clay); background:var(--raised); box-shadow:0 0 0 3px var(--clay-glow); }
  .fi::placeholder { color:var(--t2); }
  .fi-ta { resize:vertical; min-height:72px; }

  /* Visibility selector */
  .vis-grid { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .vis-opt {
    padding:14px; background:var(--surf); border:2px solid var(--b1);
    border-radius:var(--r12); cursor:pointer; transition:all 0.15s;
  }
  .vis-opt:hover { border-color:var(--b3); }
  .vis-opt.sel { border-color:var(--clay); background:rgba(232,132,90,0.07); }
  .vis-ico  { font-size:22px; margin-bottom:8px; }
  .vis-name { font-size:13px; font-weight:600; margin-bottom:3px; }
  .vis-sub  { font-size:11px; color:var(--t2); }

  /* Chips */
  .chip-row { display:flex; flex-wrap:wrap; gap:7px; }
  .chip {
    padding:6px 13px; background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r99); font-size:12px; cursor:pointer; color:var(--t1);
    transition:all 0.13s;
  }
  .chip:hover { border-color:var(--b3); color:var(--t0); }
  .chip.sel { background:rgba(232,132,90,0.1); border-color:var(--clay); color:var(--t0); }

  .dt-row { display:grid; grid-template-columns:1fr 1fr; gap:9px; }
  .cal-row { display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }

  /* ════════════════════════════════
     AUTH
  ════════════════════════════════ */
  .auth-page {
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:20px;
    background:
      radial-gradient(ellipse 80% 60% at 30% 0%, rgba(232,132,90,0.12) 0%, transparent 55%),
      radial-gradient(ellipse 60% 50% at 80% 100%, rgba(107,158,255,0.10) 0%, transparent 55%),
      var(--ink);
    animation:aurora 25s ease infinite;
    background-size:200% 200%;
  }
  .auth-card {
    width:100%; max-width:400px;
    background:rgba(18,15,12,0.85);
    backdrop-filter:blur(20px) saturate(1.3);
    border:1px solid rgba(232,132,90,0.15);
    border-radius:var(--r24);
    padding:44px 36px;
    box-shadow:0 24px 64px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.03) inset;
    animation:fadeUp 0.35s ease;
  }
  .auth-top { text-align:center; margin-bottom:32px; }
  .auth-mark {
    width:56px; height:56px; border-radius:17px; margin:0 auto 14px;
    background:linear-gradient(135deg,var(--clay),#C4624A);
    display:flex; align-items:center; justify-content:center;
    font-family:var(--hf); font-weight:700; font-size:22px; color:#fff;
    letter-spacing:0.02em;
    box-shadow:0 10px 32px rgba(232,132,90,0.35);
    animation:float 4s ease-in-out infinite;
  }
  .auth-name    { font-family:var(--hf); font-size:30px; font-weight:700; margin-bottom:4px; letter-spacing:0.01em; }
  .auth-tagline { font-size:13px; color:var(--t1); font-style:italic; }

  .g-btn {
    width:100%; padding:12px 16px; background:var(--surf);
    border:1px solid var(--b2); border-radius:var(--r12);
    color:var(--t0); font-family:var(--bf); font-size:14px;
    font-weight:500; cursor:pointer; display:flex; align-items:center;
    justify-content:center; gap:11px; transition:all 0.15s; margin-bottom:16px;
  }
  .g-btn:hover { background:var(--raised); border-color:var(--b3); }

  .divider { display:flex; align-items:center; gap:12px; margin:16px 0; color:var(--t2); font-size:11px; letter-spacing:0.07em; }
  .divider::before,.divider::after { content:''; flex:1; height:1px; background:var(--b1); }

  .auth-foot { text-align:center; margin-top:16px; font-size:12px; color:var(--t1); }
  .auth-foot a { color:var(--clay); cursor:pointer; }
  .auth-tos { text-align:center; margin-top:10px; font-size:11px; color:var(--t2); line-height:1.7; }
  .auth-tos a { color:var(--t1); }

  /* ════════════════════════════════
     ONBOARDING
  ════════════════════════════════ */
  .onb-page {
    min-height:100vh; display:flex; align-items:center; justify-content:center;
    padding:40px 20px;
    background:
      radial-gradient(ellipse 70% 50% at 70% 110%, rgba(107,158,255,0.08) 0%, transparent 55%),
      var(--ink);
  }
  .onb-box { width:100%; max-width:560px; animation:fadeUp 0.3s ease; }
  .onb-step  { font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:var(--clay); margin-bottom:14px; }
  .onb-title { font-family:var(--hf); font-size:30px; font-weight:700; margin-bottom:7px; line-height:1.25; letter-spacing:0.01em; }
  .onb-sub   { color:var(--t1); font-size:14px; margin-bottom:24px; line-height:1.65; }
  .onb-sw { position:relative; margin-bottom:18px; }
  .onb-si {
    width:100%; padding:11px 14px 11px 38px;
    background:var(--base); border:1px solid var(--b2);
    border-radius:var(--r12); color:var(--t0); font-family:var(--bf);
    font-size:14px; outline:none; transition:all 0.16s;
  }
  .onb-si:focus { border-color:var(--clay); box-shadow:0 0 0 3px var(--clay-glow); }
  .onb-si::placeholder { color:var(--t2); }
  .onb-sico { position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--t2); }
  .topics-grid { display:flex; flex-wrap:wrap; gap:8px; max-height:270px; overflow-y:auto; margin-bottom:20px; }
  .t-chip {
    padding:8px 16px; background:var(--base); border:1px solid var(--b2);
    border-radius:var(--r99); font-size:13px; font-weight:500; cursor:pointer;
    transition:all 0.13s; color:var(--t1); user-select:none;
  }
  .t-chip:hover { border-color:var(--b3); color:var(--t0); transform:translateY(-2px); }
  .t-chip.sel {
    background:rgba(232,132,90,0.1); border-color:var(--clay); color:var(--t0);
    box-shadow:0 0 10px rgba(232,132,90,0.15);
  }
  .onb-count { text-align:center; font-size:12px; color:var(--t2); margin-top:9px; font-style:italic; }

  /* ════════════════════════════════
     HOME
  ════════════════════════════════ */
  .home-wrap { flex:1; overflow-y:auto; padding:28px 26px 60px; }
  .home-hero { margin-bottom:28px; }
  .home-hero h2 { font-family:var(--hf); font-size:24px; font-weight:700; margin-bottom:5px; }
  .home-hero p  { font-size:13px; color:var(--t1); }
  .home-row  { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
  .home-row h3 { font-family:var(--hf); font-size:16px; font-weight:600; }
  .rooms-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(255px,1fr)); gap:13px; }

  .room-card {
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r16); padding:20px; cursor:pointer;
    transition:all 0.22s cubic-bezier(0.22,1,0.36,1); position:relative; overflow:hidden;
  }
  .room-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, var(--clay), var(--sky), var(--sage));
    opacity:0; transition:opacity 0.3s;
  }
  .room-card:hover::before { opacity:1; }
  .room-card:hover { border-color:var(--b2); transform:translateY(-3px); box-shadow:0 12px 32px rgba(232,132,90,0.12), 0 0 0 1px rgba(232,132,90,0.08); }
  .room-card.new-card {
    border-style:dashed; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:7px;
    min-height:130px; color:var(--clay);
  }
  .room-card.new-card:hover { background:rgba(232,132,90,0.04); border-color:rgba(232,132,90,0.3); }
  .rc-type  { position:absolute; top:15px; right:15px; font-size:13px; }
  .rc-name  { font-family:var(--hf); font-size:15px; font-weight:600; margin-bottom:5px; padding-right:22px; }
  .rc-desc  { font-size:12px; color:var(--t1); margin-bottom:15px; line-height:1.65; }
  .rc-foot  { display:flex; align-items:center; justify-content:space-between; }
  .rc-mem   { display:flex; align-items:center; gap:6px; font-size:12px; color:var(--t1); }
  .rc-avs   { display:flex; }
  .rc-av    { width:20px; height:20px; border-radius:50%; background:linear-gradient(135deg,var(--clay),#C4624A); border:2px solid var(--surf); margin-left:-6px; font-size:7px; font-weight:700; display:flex; align-items:center; justify-content:center; color:#fff; }
  .rc-av:first-child { margin-left:0; }
  .btn-enter {
    padding:5px 13px; background:var(--raised); border:1px solid var(--b2);
    border-radius:var(--r8); font-size:11px; font-weight:700; color:var(--t1);
    cursor:pointer; text-transform:uppercase; letter-spacing:0.05em; transition:all 0.13s;
  }
  .btn-enter:hover { color:var(--t0); border-color:var(--b3); }

  /* Empty state */
  .empty { display:flex; flex-direction:column; align-items:center; text-align:center; padding:60px 24px; gap:11px; }
  .empty-ico   { font-size:36px; opacity:0.4; margin-bottom:4px; }
  .empty-title { font-family:var(--hf); font-size:17px; font-weight:600; color:var(--t1); }
  .empty-sub   { font-size:13px; color:var(--t2); max-width:260px; line-height:1.7; font-style:italic; }

  /* ════════════════════════════════
     ROOM DETAIL
  ════════════════════════════════ */
  .room-detail { display:flex; flex-direction:column; flex:1; overflow:hidden; }

  .rd-header {
    padding:13px 18px; border-bottom:1px solid var(--b0);
    display:flex; align-items:center; gap:11px; flex-shrink:0;
  }
  .back-btn {
    background:none; border:none; color:var(--t2); cursor:pointer;
    font-size:12px; display:flex; align-items:center; gap:5px;
    padding:6px 9px; border-radius:var(--r8); transition:all 0.13s; white-space:nowrap;
  }
  .back-btn:hover { color:var(--t0); background:var(--surf); }
  .rd-title-area { flex:1; min-width:0; }
  .rd-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .rd-row h2 { font-family:var(--hf); font-size:16px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .badge { padding:2px 8px; border-radius:var(--r99); font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
  .badge-pub  { background:rgba(92,184,130,0.1);  color:var(--sage); }
  .badge-priv { background:rgba(212,168,83,0.1); color:var(--gold); }
  .rd-meta { font-size:11px; color:var(--t2); margin-top:2px; }
  .rd-actions { display:flex; gap:5px; margin-left:auto; }
  .abt {
    width:33px; height:33px; border-radius:var(--r8); background:var(--surf);
    border:1px solid var(--b1); display:flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--t1); font-size:14px; transition:all 0.13s;
  }
  .abt:hover { background:rgba(107,158,255,0.1); border-color:rgba(107,158,255,0.3); color:var(--sky); }
  .abt.g:hover { background:rgba(92,184,130,0.1); border-color:rgba(92,184,130,0.3); color:var(--sage); }
  .abt.r { color:var(--rose); }
  .abt.r:hover { background:rgba(232,90,107,0.1); border-color:rgba(232,90,107,0.3); }
  .abt:disabled { opacity:0.25; cursor:not-allowed; }

  /* Tabs */
  .tabs { display:flex; gap:2px; padding:9px 16px; border-bottom:1px solid var(--b0); flex-shrink:0; }
  .tab { padding:6px 14px; border-radius:var(--r8); font-size:12px; font-weight:600; cursor:pointer; color:var(--t2); transition:all 0.18s; background:none; border:none; text-transform:capitalize; font-family:var(--bf); position:relative; }
  .tab:hover { color:var(--t0); background:var(--surf); }
  .tab.active { color:var(--t0); background:var(--surf); }
  .tab.active::after {
    content:''; position:absolute; bottom:-9px; left:20%; width:60%; height:2px;
    background:linear-gradient(90deg, var(--clay), var(--sky));
    border-radius:2px;
    box-shadow:0 0 8px rgba(232,132,90,0.4);
    animation:tabSlide 0.3s ease;
  }

  /* Pinned conclusion */
  .pinned {
    margin:12px 16px; padding:14px 16px; flex-shrink:0;
    background:linear-gradient(120deg,rgba(232,132,90,0.07),rgba(107,158,255,0.07));
    border:1px solid rgba(232,132,90,0.18); border-radius:var(--r12);
  }
  .pinned-tag { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--clay); display:flex; justify-content:space-between; margin-bottom:9px; }
  .pinned-by  { color:var(--t2); font-weight:400; text-transform:none; letter-spacing:0; }
  .pinned-body{ font-size:13px; color:var(--t0); line-height:1.65; }

  /* Messages */
  .msgs { flex:1; overflow-y:auto; padding:12px 16px; display:flex; flex-direction:column; gap:10px; }
  .msg {
    background:var(--surf); border:1px solid var(--b0);
    border-radius:var(--r14); padding:12px 14px;
    animation:fadeUp 0.2s ease;
    transition:all 0.2s cubic-bezier(0.22,1,0.36,1);
    border-left:2px solid transparent;
  }
  .msg:hover {
    border-color:var(--b1);
    border-left-color:var(--clay);
    transform:translateX(3px);
    box-shadow:0 4px 16px rgba(0,0,0,0.08);
  }
  .msg-head { display:flex; align-items:center; gap:8px; margin-bottom:7px; }
  .msg-av { width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#fff; flex-shrink:0; }
  .msg-name { font-weight:600; font-size:13px; }
  .msg-role { padding:1px 6px; border-radius:var(--r4); font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; }
  .mr-owner  { background:rgba(232,132,90,0.14); color:var(--clay); }
  .mr-member { background:rgba(255,240,220,0.05); color:var(--t2); }
  .msg-time  { margin-left:auto; font-size:11px; color:var(--t2); }
  .msg-reply { font-size:11px; color:var(--t2); margin-bottom:5px; }
  .msg-reply span { color:var(--clay); }
  .msg-body  { font-size:13px; line-height:1.7; color:var(--t0); }
  .msg-foot  { display:flex; align-items:center; gap:5px; margin-top:9px; flex-wrap:wrap; }
  .react-btn { padding:3px 9px; background:var(--raised); border:1px solid var(--b1); border-radius:var(--r4); font-size:11px; cursor:pointer; color:var(--t1); transition:all 0.13s; font-family:var(--bf); }
  .react-btn:hover { background:var(--overlay); }
  .react-btn.on { background:rgba(232,132,90,0.1); border-color:rgba(232,132,90,0.3); color:var(--clay); }
  .reply-link { margin-left:auto; font-size:11px; color:var(--t2); cursor:pointer; padding:3px 7px; border-radius:var(--r4); transition:all 0.13s; }
  .reply-link:hover { color:var(--clay); background:rgba(232,132,90,0.08); }

  /* Reply bar */
  .reply-bar { display:flex; align-items:center; justify-content:space-between; padding:6px 16px; background:rgba(232,132,90,0.06); border-top:1px solid var(--b0); font-size:12px; color:var(--t1); flex-shrink:0; }
  .reply-bar strong { color:var(--clay); }
  .reply-bar button { background:none; border:none; color:var(--t2); cursor:pointer; font-size:15px; }

  /* Composer */
  .composer { padding:10px 16px 14px; border-top:1px solid var(--b0); flex-shrink:0; }
  .cmp-inner {
    display:flex; gap:9px; align-items:flex-end;
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r14); padding:9px 11px;
    transition:all 0.25s cubic-bezier(0.22,1,0.36,1);
  }
  .cmp-inner:focus-within {
    border-color:var(--clay);
    box-shadow:0 0 0 3px var(--clay-glow), 0 8px 24px rgba(232,132,90,0.08);
  }
  .cmp-ta { flex:1; background:none; border:none; color:var(--t0); font-family:var(--bf); font-size:13px; outline:none; resize:none; min-height:32px; max-height:110px; line-height:1.55; }
  .cmp-ta::placeholder { color:var(--t2); }
  .cmp-send {
    width:32px; height:32px; border-radius:var(--r8);
    background:linear-gradient(135deg, var(--clay), #D46A42);
    border:none; color:#fff; font-size:12px; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
    transition:all 0.22s cubic-bezier(0.22,1,0.36,1); flex-shrink:0;
    box-shadow:0 2px 8px rgba(232,132,90,0.3);
  }
  .cmp-send:hover {
    background:linear-gradient(135deg, #D46A42, var(--clay));
    transform:scale(1.12);
    box-shadow:0 4px 16px rgba(232,132,90,0.5);
  }

  /* Profanity toast */
  .warn-toast {
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:#1A0B0D; border:1px solid rgba(232,90,107,0.35);
    color:var(--rose); padding:10px 20px; border-radius:var(--r12);
    font-size:13px; font-weight:600; z-index:999; white-space:nowrap;
    animation:toastUp 0.25s ease, toastOut 0.3s ease 2.7s forwards;
    box-shadow:var(--sh-md);
  }

  /* ════════════════════════════════
     PEOPLE & CONNECTIONS
     ── THE CORE NEW FEATURE ──
     3 states per user:
       NONE → can send request
       PENDING_SENT → waiting for them
       PENDING_INCOMING → they sent you one
       ACCEPTED → fully connected
  ════════════════════════════════ */
  .people-scroll { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:9px; }
  .people-intro { padding:0 0 8px; }
  .people-intro h3 { font-family:var(--hf); font-size:18px; font-weight:600; margin-bottom:4px; }
  .people-intro p  { font-size:13px; color:var(--t1); font-style:italic; }

  .person-card {
    display:flex; align-items:center; gap:13px; padding:14px 15px;
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r16); transition:all 0.16s;
  }
  .person-card:hover { border-color:var(--b2); box-shadow:var(--sh-sm); }
  .p-info { flex:1; min-width:0; }
  .p-name   { font-size:14px; font-weight:600; margin-bottom:1px; }
  .p-handle { font-size:11px; color:var(--t2); }
  .p-status { font-size:11px; display:flex; align-items:center; gap:4px; margin-top:2px; }
  .p-bio    { font-size:12px; color:var(--t1); margin-top:4px; font-style:italic; line-height:1.5; }
  .p-tags   { display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }
  .p-tag    { padding:2px 8px; background:var(--raised); border-radius:var(--r4); font-size:10px; color:var(--t2); }
  .p-actions { display:flex; flex-direction:column; gap:7px; align-items:flex-end; flex-shrink:0; }

  /* Connection button states */
  .conn-btn {
    padding:7px 15px; border-radius:var(--r8); font-family:var(--bf);
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.14s;
    white-space:nowrap; border:none;
  }
  .conn-none     {
    background:linear-gradient(135deg, var(--clay), #D46A42);
    color:#fff; box-shadow:0 3px 10px rgba(232,132,90,0.25);
  }
  .conn-none:hover {
    background:linear-gradient(135deg, #D46A42, var(--clay));
    transform:translateY(-2px);
    box-shadow:0 6px 20px rgba(232,132,90,0.4);
  }
  .conn-sent     { background:var(--raised); border:1px solid var(--b2) !important; color:var(--t2); cursor:default; }
  .conn-incoming { background:rgba(92,184,130,0.12); border:1px solid rgba(92,184,130,0.3) !important; color:var(--sage); }
  .conn-accepted { background:var(--raised); border:1px solid var(--b2) !important; color:var(--t1); }

  /* Call buttons — only visible when ACCEPTED */
  .call-btns { display:flex; gap:5px; }
  .call-mini { width:30px; height:30px; border-radius:var(--r8); background:var(--raised); border:1px solid var(--b2); display:flex; align-items:center; justify-content:center; cursor:pointer; font-size:13px; transition:all 0.13s; }
  .call-mini.g:hover { background:rgba(92,184,130,0.12); border-color:rgba(92,184,130,0.3); }
  .call-mini:hover    { background:rgba(107,158,255,0.12); border-color:rgba(107,158,255,0.3); }

  /* Locked hint */
  .lock-hint { font-size:11px; color:var(--t2); font-style:italic; text-align:right; }

  /* ════════════════════════════════
     CALL MODAL
  ════════════════════════════════ */
  .call-overlay { position:fixed; inset:0; background:rgba(12,10,8,0.92); backdrop-filter:blur(20px); z-index:400; display:flex; align-items:center; justify-content:center; }
  .call-modal   { background:var(--base); border:1px solid var(--b2); border-radius:var(--r24); padding:44px; text-align:center; min-width:290px; box-shadow:var(--sh-lg); animation:popIn 0.24s ease; }
  .call-av {
    width:70px; height:70px; border-radius:50%; display:flex;
    align-items:center; justify-content:center; font-size:26px;
    font-weight:700; color:#fff; margin:0 auto 16px;
    box-shadow:0 0 24px rgba(232,132,90,0.3);
    animation:logoBreath 3s ease-in-out infinite;
  }
  .call-type-lbl { font-size:10px; color:var(--t2); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:4px; }
  .call-name     { font-family:var(--hf); font-size:20px; font-weight:600; margin-bottom:6px; }
  .call-status   { font-size:13px; color:var(--t1); margin-bottom:6px; }
  .call-note     { font-size:11px; color:var(--t2); margin-bottom:28px; font-style:italic; }
  .call-ctrls    { display:flex; gap:14px; justify-content:center; }
  .call-ctrl { width:50px; height:50px; border-radius:50%; border:none; font-size:20px; cursor:pointer; transition:all 0.18s; display:flex; align-items:center; justify-content:center; }
  .ctrl-mute { background:var(--surf); border:1px solid var(--b2); color:var(--t1); }
  .ctrl-mute:hover { background:var(--raised); }
  .ctrl-end  { background:var(--rose); }
  .ctrl-end:hover { background:#c0293d; transform:scale(1.07); }

  /* ════════════════════════════════
     PROFILE
  ════════════════════════════════ */
  .profile-page  { flex:1; overflow-y:auto; padding:26px; }
  .profile-card  { background:var(--surf); border:1px solid var(--b1); border-radius:var(--r16); padding:26px; margin-bottom:14px; }
  .profile-top   { display:flex; align-items:flex-start; gap:20px; margin-bottom:20px; }
  .profile-info  { flex:1; }
  .profile-name  { font-family:var(--hf); font-size:24px; font-weight:700; margin-bottom:2px; }
  .profile-handle{ font-size:13px; color:var(--t2); margin-bottom:10px; }
  .profile-chips { display:flex; gap:7px; flex-wrap:wrap; margin-bottom:11px; }
  .profile-bio   { font-size:13px; color:var(--t1); line-height:1.7; font-style:italic; }
  .prof-sec      { font-size:10px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:var(--t2); margin:18px 0 10px; }
  .tag-row  { display:flex; flex-wrap:wrap; gap:7px; }
  .tag-item { padding:5px 12px; background:var(--raised); border:1px solid var(--b1); border-radius:var(--r8); font-size:12px; color:var(--t1); }
  .room-list-row { padding:9px 12px; background:var(--raised); border-radius:var(--r8); font-size:13px; cursor:pointer; transition:background 0.13s; margin-bottom:5px; }
  .room-list-row:hover { background:var(--overlay); }
  .prof-actions { display:flex; gap:10px; margin-top:22px; padding-top:18px; border-top:1px solid var(--b1); flex-wrap:wrap; }

  /* ════════════════════════════════
     SETTINGS MODAL
  ════════════════════════════════ */
  .s-section { margin-bottom:20px; }
  .s-label { font-size:10px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:var(--t2); margin-bottom:10px; }

  /* Password fields */
  .pw-fields { display:flex; flex-direction:column; gap:10px; }
  .pw-field { display:flex; flex-direction:column; gap:4px; }
  .pw-field label { font-size:12px; color:var(--t1); font-weight:500; }
  .pw-input {
    padding:9px 12px; background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r8); color:var(--t0); font-family:var(--bf);
    font-size:13px; outline:none; transition:all 0.16s;
  }
  .pw-input:focus { border-color:var(--clay); box-shadow:0 0 0 3px var(--clay-glow); }
  .pw-msg {
    font-size:12px; padding:8px 12px; border-radius:var(--r8); margin-top:6px;
    animation:fadeUp 0.2s ease;
  }
  .pw-msg.ok  { background:rgba(92,184,130,0.1); color:var(--sage); border:1px solid rgba(92,184,130,0.2); }
  .pw-msg.err { background:rgba(232,90,107,0.1); color:var(--rose); border:1px solid rgba(232,90,107,0.2); }

  /* Verified Badge */
  .vb-card {
    background:linear-gradient(135deg, rgba(232,132,90,0.06), rgba(107,158,255,0.06));
    border:1px solid rgba(232,132,90,0.18); border-radius:var(--r14);
    padding:18px; position:relative; overflow:hidden;
  }
  .vb-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, var(--clay), var(--gold), var(--sky));
  }
  .vb-top { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
  .vb-icon { font-size:28px; }
  .vb-title { font-family:var(--hf); font-size:15px; font-weight:700; }
  .vb-price { font-size:12px; color:var(--t1); margin-top:2px; }
  .vb-perks { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
  .vb-perk { font-size:12px; color:var(--t1); display:flex; align-items:center; gap:7px; }
  .vb-perk::before { content:'✓'; color:var(--sage); font-weight:700; font-size:11px; }
  .vb-buy {
    width:100%; padding:11px; border:none; border-radius:var(--r10);
    background:linear-gradient(135deg, var(--clay), var(--gold));
    color:#fff; font-family:var(--bf); font-size:14px; font-weight:700;
    cursor:pointer; transition:all 0.22s cubic-bezier(0.22,1,0.36,1);
    box-shadow:0 4px 16px rgba(232,132,90,0.3);
    letter-spacing:0.02em; position:relative; overflow:hidden;
  }
  .vb-buy::before {
    content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition:left 0.5s;
  }
  .vb-buy:hover::before { left:100%; }
  .vb-buy:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(232,132,90,0.4); }
  .vb-owned {
    width:100%; padding:11px; border:1px solid rgba(92,184,130,0.3);
    border-radius:var(--r10); background:rgba(92,184,130,0.08);
    color:var(--sage); font-family:var(--bf); font-size:13px; font-weight:600;
    text-align:center; cursor:default;
  }
  .verified-badge {
    display:inline-flex; align-items:center; justify-content:center;
    width:16px; height:16px; border-radius:50%; font-size:9px;
    background:linear-gradient(135deg, var(--clay), var(--gold));
    color:#fff; margin-left:4px; vertical-align:middle;
    box-shadow:0 0 8px rgba(232,132,90,0.3);
    flex-shrink:0;
  }
  .verified-badge-lg {
    display:inline-flex; align-items:center; justify-content:center;
    width:20px; height:20px; border-radius:50%; font-size:11px;
    background:linear-gradient(135deg, var(--clay), var(--gold));
    color:#fff; margin-left:5px;
    box-shadow:0 0 10px rgba(232,132,90,0.4);
  }

  /* Circle limit banner */
  .limit-banner {
    display:flex; align-items:center; gap:10px; padding:12px 16px;
    background:rgba(212,168,83,0.08); border:1px solid rgba(212,168,83,0.2);
    border-radius:var(--r12); margin-bottom:16px; animation:fadeUp 0.2s ease;
  }
  .limit-banner-icon { font-size:20px; flex-shrink:0; }
  .limit-banner-text { flex:1; }
  .limit-banner-title { font-size:13px; font-weight:600; color:var(--gold); }
  .limit-banner-sub { font-size:11px; color:var(--t2); margin-top:2px; }
  .limit-banner .btn-primary { padding:7px 14px; font-size:11px; }
  .tog-row { display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--b0); }
  .tog-row:last-child { border-bottom:none; }
  .tog-label { font-size:13px; font-weight:500; }
  .tog-sub   { font-size:11px; color:var(--t2); margin-top:2px; }
  .toggle    { width:40px; height:22px; border-radius:11px; background:var(--overlay); border:none; cursor:pointer; position:relative; transition:background 0.2s; flex-shrink:0; }
  .toggle.on { background:var(--clay); }
  .toggle::after { content:''; position:absolute; width:16px; height:16px; border-radius:50%; background:#fff; top:3px; left:3px; transition:transform 0.2s; box-shadow:0 1px 4px rgba(0,0,0,0.3); }
  .toggle.on::after { transform:translateX(18px); }

  /* Invite modal */
  .invite-list { display:flex; flex-direction:column; gap:8px; margin:14px 0; }
  .inv-row { display:flex; align-items:center; gap:10px; padding:10px 12px; background:var(--surf); border-radius:var(--r10); }
  .inv-name { flex:1; font-size:13px; font-weight:500; }

  @media (max-width: 768px) {
    .app { width:100%; height:100vh; margin:0; border-radius:0; }
    .app::before, .app::after { display:none; }
    .sidebar { display:none; }
    .home-wrap { padding:16px; }
    .rooms-grid { grid-template-columns:1fr; }
    .profile-page { padding:16px; }
    .discover-grid { grid-template-columns:1fr; }
    .dm-layout { flex-direction:column; }
    .dm-sidebar { width:100%; min-width:unset; max-height:200px; border-right:none; border-bottom:1px solid var(--b1); }
  }

  /* ════════════════════════════════
     PHASE 2 — HOME TABS (My Rooms / Discover)
  ════════════════════════════════ */
  .home-tabs { display:flex; gap:4px; margin-bottom:18px; background:var(--surf); border-radius:var(--r12); padding:4px; border:1px solid var(--b1); }
  .home-tab {
    flex:1; padding:10px 16px; border:none; border-radius:var(--r10);
    font-family:var(--bf); font-size:13px; font-weight:600; cursor:pointer;
    color:var(--t2); background:transparent; transition:all 0.18s;
    display:flex; align-items:center; justify-content:center; gap:7px;
  }
  .home-tab:hover { color:var(--t0); }
  .home-tab.active {
    background:rgba(232,132,90,0.12); color:var(--t0);
    box-shadow:0 2px 8px rgba(232,132,90,0.1);
  }

  /* ════════════════════════════════
     PHASE 2 — GEO BADGE + RADIUS SELECTOR
  ════════════════════════════════ */
  .geo-badge {
    display:inline-flex; align-items:center; gap:4px;
    padding:3px 9px; background:rgba(107,158,255,0.08);
    border:1px solid rgba(107,158,255,0.2);
    border-radius:var(--r99); font-size:10px; font-weight:600; color:var(--sky);
  }
  .radius-grid {
    display:grid; grid-template-columns:repeat(auto-fill, minmax(110px,1fr));
    gap:7px; margin-top:8px;
  }
  .radius-opt {
    padding:10px 8px; background:var(--surf); border:2px solid var(--b1);
    border-radius:var(--r10); cursor:pointer; text-align:center;
    transition:all 0.15s; font-size:12px; font-weight:600; color:var(--t1);
  }
  .radius-opt:hover { border-color:var(--b3); color:var(--t0); }
  .radius-opt.sel { border-color:var(--sky); background:rgba(107,158,255,0.07); color:var(--t0); }

  /* ════════════════════════════════
     PHASE 2 — DISCOVER TAB
  ════════════════════════════════ */
  .discover-filters {
    display:flex; align-items:center; gap:8px; flex-wrap:wrap;
    margin-bottom:16px; padding-bottom:14px; border-bottom:1px solid var(--b0);
  }
  .filter-chip {
    padding:6px 14px; background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r99); font-size:12px; font-weight:500; cursor:pointer;
    color:var(--t2); transition:all 0.13s; white-space:nowrap;
  }
  .filter-chip:hover { border-color:var(--b3); color:var(--t0); }
  .filter-chip.sel { background:rgba(232,132,90,0.1); border-color:var(--clay); color:var(--t0); }
  .nearme-toggle {
    display:flex; align-items:center; gap:6px; padding:6px 14px;
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r99); font-size:12px; font-weight:600; cursor:pointer;
    color:var(--t2); transition:all 0.13s; margin-left:auto; white-space:nowrap;
  }
  .nearme-toggle:hover { border-color:var(--sky); color:var(--sky); }
  .nearme-toggle.on { background:rgba(107,158,255,0.1); border-color:var(--sky); color:var(--sky); }
  .discover-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:13px; }
  .discover-card {
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r16); padding:20px; transition:all 0.22s;
    position:relative; overflow:hidden;
  }
  .discover-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:linear-gradient(90deg, var(--sky), var(--sage));
    opacity:0; transition:opacity 0.3s;
  }
  .discover-card:hover::before { opacity:1; }
  .discover-card:hover { border-color:var(--b2); transform:translateY(-2px); box-shadow:0 8px 24px rgba(107,158,255,0.1); }
  .dc-header { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; margin-bottom:8px; }
  .dc-name { font-family:var(--hf); font-size:15px; font-weight:600; flex:1; }
  .dc-creator { font-size:11px; color:var(--t2); margin-bottom:6px; }
  .dc-desc { font-size:12px; color:var(--t1); line-height:1.6; margin-bottom:14px; }
  .dc-foot { display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; }
  .dc-meta { display:flex; align-items:center; gap:10px; }
  .dc-members { font-size:11px; color:var(--t2); display:flex; align-items:center; gap:4px; }
  .btn-join {
    padding:7px 16px; border:none; border-radius:var(--r8);
    background:linear-gradient(135deg, var(--sky), #5A8AE6);
    color:#fff; font-family:var(--bf); font-size:12px; font-weight:700;
    cursor:pointer; transition:all 0.18s; box-shadow:0 3px 10px rgba(107,158,255,0.25);
  }
  .btn-join:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(107,158,255,0.4); }
  .btn-leave {
    padding:7px 14px; border:1px solid rgba(232,90,107,0.25); border-radius:var(--r8);
    background:transparent; color:var(--rose); font-family:var(--bf);
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .btn-leave:hover { background:rgba(232,90,107,0.07); }
  .btn-open {
    padding:7px 14px; border:1px solid var(--b2); border-radius:var(--r8);
    background:var(--raised); color:var(--t0); font-family:var(--bf);
    font-size:12px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .btn-open:hover { background:var(--overlay); }

  /* ════════════════════════════════
     PHASE 2 — DIRECT MESSAGES
  ════════════════════════════════ */
  .dm-layout { display:flex; flex:1; overflow:hidden; }
  .dm-sidebar {
    width:280px; min-width:280px; border-right:1px solid var(--b1);
    background:var(--base); display:flex; flex-direction:column; overflow:hidden;
  }
  .dm-sb-head {
    padding:16px; border-bottom:1px solid var(--b0);
    font-family:var(--hf); font-size:16px; font-weight:600;
  }
  .dm-list { flex:1; overflow-y:auto; }
  .dm-item {
    display:flex; align-items:center; gap:10px; padding:12px 16px;
    cursor:pointer; transition:background 0.12s; border-bottom:1px solid var(--b0);
  }
  .dm-item:hover { background:var(--surf); }
  .dm-item.active { background:rgba(232,132,90,0.08); }
  .dm-item-info { flex:1; min-width:0; }
  .dm-item-name { font-size:13px; font-weight:600; }
  .dm-item-preview { font-size:11px; color:var(--t2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }
  .dm-item-time { font-size:10px; color:var(--t2); flex-shrink:0; }
  .dm-empty-sb { padding:24px 16px; text-align:center; }
  .dm-empty-sb-ico { font-size:28px; opacity:0.4; margin-bottom:8px; }
  .dm-empty-sb-text { font-size:12px; color:var(--t2); line-height:1.7; font-style:italic; }

  .dm-main { flex:1; display:flex; flex-direction:column; overflow:hidden; }
  .dm-header {
    padding:14px 18px; border-bottom:1px solid var(--b0);
    display:flex; align-items:center; gap:11px; flex-shrink:0;
  }
  .dm-header-name { font-family:var(--hf); font-size:15px; font-weight:600; }
  .dm-header-status { font-size:11px; color:var(--t2); display:flex; align-items:center; gap:4px; margin-top:2px; }
  .dm-msgs { flex:1; overflow-y:auto; padding:16px; display:flex; flex-direction:column; gap:8px; }
  .dm-bubble {
    max-width:70%; padding:10px 14px; border-radius:var(--r14);
    font-size:13px; line-height:1.6; animation:fadeUp 0.15s ease;
  }
  .dm-bubble.mine {
    align-self:flex-end; background:var(--clay); color:#fff;
    border-bottom-right-radius:4px;
  }
  .dm-bubble.theirs {
    align-self:flex-start; background:var(--surf); border:1px solid var(--b1);
    color:var(--t0); border-bottom-left-radius:4px;
  }
  .dm-bubble-time { font-size:10px; opacity:0.7; margin-top:4px; }
  .dm-no-select {
    flex:1; display:flex; flex-direction:column; align-items:center;
    justify-content:center; gap:10px; color:var(--t2);
  }
  .dm-no-select-ico { font-size:36px; opacity:0.3; }
  .dm-no-select-text { font-size:14px; font-style:italic; }
  .dm-composer { padding:10px 16px 14px; border-top:1px solid var(--b0); flex-shrink:0; }
  .dm-cmp-inner {
    display:flex; gap:9px; align-items:flex-end;
    background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r14); padding:9px 11px;
    transition:all 0.25s;
  }
  .dm-cmp-inner:focus-within { border-color:var(--clay); box-shadow:0 0 0 3px var(--clay-glow); }

  /* ════════════════════════════════
     PHASE 2 — PREMIUM MODAL
  ════════════════════════════════ */
  .premium-modal { max-width:440px; text-align:center; }
  .pm-star { font-size:48px; margin-bottom:12px; }
  .pm-title { font-family:var(--hf); font-size:24px; font-weight:700; margin-bottom:4px; }
  .pm-price { font-size:18px; font-weight:700; color:var(--clay); margin-bottom:18px; }
  .pm-price span { font-size:13px; font-weight:400; color:var(--t2); }
  .pm-features { text-align:left; margin-bottom:24px; display:flex; flex-direction:column; gap:10px; }
  .pm-feat {
    display:flex; align-items:center; gap:10px; font-size:13px; color:var(--t1);
    padding:8px 12px; background:var(--surf); border-radius:var(--r10);
    border:1px solid var(--b0);
  }
  .pm-feat-ico { font-size:16px; flex-shrink:0; }
  .pm-actions { display:flex; gap:10px; }
  .pm-start {
    flex:1; padding:14px 20px; border:none; border-radius:var(--r12);
    background:linear-gradient(135deg, var(--clay), var(--gold));
    color:#fff; font-family:var(--bf); font-size:15px; font-weight:700;
    cursor:pointer; transition:all 0.22s; box-shadow:0 4px 16px rgba(232,132,90,0.3);
    position:relative; overflow:hidden;
  }
  .pm-start::before {
    content:''; position:absolute; top:0; left:-100%; width:100%; height:100%;
    background:linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
    transition:left 0.5s;
  }
  .pm-start:hover::before { left:100%; }
  .pm-start:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(232,132,90,0.45); }
  .pm-cancel {
    padding:14px 20px; border:1px solid var(--b2); border-radius:var(--r12);
    background:transparent; color:var(--t1); font-family:var(--bf);
    font-size:14px; font-weight:600; cursor:pointer; transition:all 0.14s;
  }
  .pm-cancel:hover { background:var(--surf); }

  /* ════════════════════════════════
     PHASE 2 — IMAGE UPLOAD
  ════════════════════════════════ */
  .cmp-attach {
    width:32px; height:32px; border-radius:var(--r8);
    background:var(--raised); border:1px solid var(--b1);
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; color:var(--t2); font-size:14px; flex-shrink:0;
    transition:all 0.14s;
  }
  .cmp-attach:hover { color:var(--clay); border-color:rgba(232,132,90,0.3); background:rgba(232,132,90,0.06); }
  .img-preview {
    display:flex; align-items:center; gap:10px; padding:8px 12px;
    margin:0 16px 4px; background:var(--surf); border:1px solid var(--b1);
    border-radius:var(--r10); animation:fadeUp 0.15s ease;
  }
  .img-preview img { height:60px; border-radius:8px; object-fit:cover; }
  .img-preview-remove {
    margin-left:auto; background:none; border:none; color:var(--t2);
    cursor:pointer; font-size:16px; padding:4px 8px; border-radius:6px;
    transition:color 0.13s;
  }
  .img-preview-remove:hover { color:var(--rose); }
  .msg-img { max-width:260px; border-radius:10px; margin-top:8px; display:block; }

  /* ════════════════════════════════
     PHASE 2 — SUCCESS TOAST
  ════════════════════════════════ */
  .success-toast {
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:rgba(18,15,12,0.95); border:1px solid rgba(92,184,130,0.35);
    color:var(--sage); padding:10px 22px; border-radius:var(--r12);
    font-size:13px; font-weight:600; z-index:999; white-space:nowrap;
    animation:toastUp 0.25s ease, toastOut 0.3s ease 2.7s forwards;
    box-shadow:var(--sh-md);
  }
`;

// ════════════════════════════════════════════════════════════
// MAIN APP
// ════════════════════════════════════════════════════════════
export default function OrbitThreadApp() {
  const [view,          setView]          = useState("auth");
  const [user,          setUser]          = useState(null);
  const [authLoading,   setAuthLoading]   = useState(true);
  const [authError,     setAuthError]     = useState("");
  const [loginLoading,  setLoginLoading]  = useState(false);
  const [authMode,      setAuthMode]      = useState("login"); // "login" | "signup"
  const [authName,      setAuthName]      = useState("");
  const [authPassword,  setAuthPassword]  = useState("");
  const [rooms,         setRooms]         = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [activeRoom,    setActiveRoom]    = useState(null);
  const [roomTab,       setRoomTab]       = useState("discussion");
  const [allMessages,   setAllMessages]   = useState({});
  const [pinned,        setPinned]        = useState({});
  const [newMsg,        setNewMsg]        = useState("");
  const [replyingTo,    setReplyingTo]    = useState(null);
  const [selectedTopics,setSelectedTopics]= useState([]);
  const [topicSearch,   setTopicSearch]  = useState("");
  const [searchQ,       setSearchQ]      = useState("");
  const [showSearch,    setShowSearch]   = useState(false);
  const [showCreate,    setShowCreate]   = useState(false);
  const [showInvite,    setShowInvite]   = useState(false);
  const [showNotifs,    setShowNotifs]   = useState(false);
  const [showSettings,  setShowSettings] = useState(false);
  const [showCall,      setShowCall]     = useState(null);
  const [profWarn,      setProfWarn]     = useState(false);
  const [email,         setEmail]        = useState("");
  const [profileSettings, setProfileSettings] = useState({
    profilePublic:true, showStatus:true, allowConnect:true, emailNotifs:true,
  });

  // ── PASSWORD CHANGE ──────────────────────────────────────
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew]         = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwMsg, setPwMsg]         = useState(null); // {type:"ok"|"err", text:"..."}

  // ── VERIFIED BADGE ───────────────────────────────────────
  const [isVerified, setIsVerified] = useState(false);
  const [subPlan, setSubPlan]       = useState("monthly"); // "monthly" | "yearly"

  // ── CIRCLE LIMIT (5 per 24h unless verified) ─────────────
  const [roomsCreatedToday, setRoomsCreatedToday] = useState([]);
  const DAILY_LIMIT = 5;

  // ── PHASE 2: GEO ────────────────────────────────────────
  const [geoEnabled, setGeoEnabled] = useState(false);
  const [userGeo, setUserGeo]       = useState(null); // { lat, lng }

  // ── PHASE 2: HOME TABS ──────────────────────────────────
  const [homeTab, setHomeTab]             = useState("my-rooms"); // "my-rooms" | "discover"
  const [discoverFilter, setDiscoverFilter] = useState("all");

  // ── PHASE 2: PUBLIC ROOMS (seed 8 rooms) ─────────────────
  const [publicRooms, setPublicRooms] = useState(SEED_ROOMS);
  const [joinedRooms, setJoinedRooms] = useState([]); // IDs of joined discover rooms

  // ── PHASE 2: DMs (now fully persistent via Supabase) ────
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [dmMsg, setDmMsg]             = useState("");
  const { conversations: dmConversations, loading: dmConvLoading, refresh: refreshConversations } = useConversations(user?.id);
  const { messages: dmRealMessages, loading: dmMsgsLoading, addOptimisticMessage } = useDirectMessages(activeConversationId);
  const { send: sendDMMessage, sending: dmSending, error: dmSendError } = useSendDirectMessage();

  // ── PHASE 2: PREMIUM MODAL ──────────────────────────────
  const [showPremium, setShowPremium] = useState(false);

  // ── PHASE 2: IMAGE UPLOAD ───────────────────────────────
  const [attachedImg, setAttachedImg] = useState(null); // base64
  const fileRef = useRef(null);

  // ── PHASE 2: SUCCESS TOAST ──────────────────────────────
  const [successToast, setSuccessToast] = useState(null);

  const getRoomsRemaining = useCallback(() => {
    if (isVerified) return Infinity;
    const now = Date.now();
    const recent = roomsCreatedToday.filter(ts => now - ts < 24 * 60 * 60 * 1000);
    return DAILY_LIMIT - recent.length;
  }, [isVerified, roomsCreatedToday]);

  const handleChangePassword = useCallback(async () => {
    setPwMsg(null);
    if (!pwNew.trim()) return setPwMsg({type:"err",text:"Enter a new password."});
    if (pwNew.length < 6) return setPwMsg({type:"err",text:"New password must be at least 6 characters."});
    if (pwNew !== pwConfirm) return setPwMsg({type:"err",text:"New passwords don't match."});
    const { error } = await supabase.auth.updateUser({ password: pwNew });
    if (error) return setPwMsg({type:"err",text:error.message});
    setPwMsg({type:"ok",text:"Password changed successfully!"});
    setPwCurrent(""); setPwNew(""); setPwConfirm("");
    setTimeout(() => setPwMsg(null), 3000);
  }, [pwNew, pwConfirm]);

  const handleBuyBadge = useCallback(async () => {
    if (isVerified) return;
    const planLabel = subPlan === "yearly" ? "$30.00/year (save 37%)" : "$4.00/month";
    const confirmed = window.confirm(
      `Subscribe to Orbit Thread Verified — ${planLabel}\n\n` +
      "• Verified checkmark on your profile\n" +
      "• Unlimited Circles (rooms) per day\n" +
      "• Priority support & early features\n\n" +
      "(This is a demo — no real charge)"
    );
    if (confirmed) {
      setIsVerified(true);
      if (user) {
        await supabase.from("profiles").update({ is_verified: true, sub_plan: subPlan }).eq("id", user.id);
      }
      addNotif(`🎉 <strong>Welcome to Verified!</strong> Your ${subPlan === "yearly" ? "annual" : "monthly"} plan is active. Unlimited Circles unlocked.`);
    }
  }, [isVerified, subPlan, user]);

  const [createForm, setCreateForm] = useState({
    name:"", purpose:"", visibility:"public", limit:"50", customLimit:"", date:"", time:"",
    radius:99999, // geo-radius for public rooms (default: Worldwide)
  });

  // ── CONNECTION STATE MAP ─────────────────────────────────
  // { userId: CS.NONE | CS.PENDING_SENT | CS.PENDING_INCOMING | CS.ACCEPTED }
  // This is the core of the new connection request feature.
  // When User A sends to User B:
  //   A's state for B → PENDING_SENT
  //   B's state for A → PENDING_INCOMING  (simulated here on same device)
  //   B sees notification with Accept/Decline buttons
  //   If B accepts → both become ACCEPTED → chat/call unlocked
  const [connStates, setConnStates] = useState({
    u1: CS.NONE, u2: CS.NONE, u3: CS.NONE, u4: CS.NONE,
  });

  const msgsEnd   = useRef(null);
  const searchRef = useRef(null);

  // ── SUPABASE AUTH LISTENER ───────────────────────────────
  useEffect(() => {
    const loadProfile = async (authUser) => {
      try {
        // 20-second timeout on profile fetch to prevent infinite hang
        const profilePromise = supabase
          .from("profiles").select("*").eq("id", authUser.id).single();
        const profileTimeout = new Promise((resolve) =>
          setTimeout(() => resolve({ data: null, error: { message: "Profile load timed out" } }), 20000)
        );
        const { data: profile, error: profileError } = await Promise.race([profilePromise, profileTimeout]);

        if (profileError || !profile) {
          // Profile doesn't exist yet (trigger may not have fired).
          // Create one from the auth user metadata so the app can proceed.
          const meta = authUser.user_metadata || {};
          const fallbackName = meta.name || authUser.email?.split("@")[0] || "User";
          const fallbackHandle = "@" + fallbackName.toLowerCase().replace(/\s+/g, "");
          const fallbackInitials = fallbackName.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);

          const { data: newProfile } = await supabase
            .from("profiles")
            .upsert({
              id: authUser.id,
              name: fallbackName,
              handle: fallbackHandle,
              initials: fallbackInitials,
            }, { onConflict: "id" })
            .select()
            .single();

          if (newProfile) {
            setUser({
              id: newProfile.id, name: newProfile.name, handle: newProfile.handle,
              initials: newProfile.initials, status: S.ONLINE,
              bio: newProfile.bio || "",
            });
            setView("onboard");
            return;
          }

          // If even upsert fails, create a minimal local user so app doesn't hang
          setUser({
            id: authUser.id, name: fallbackName, handle: fallbackHandle,
            initials: fallbackInitials, status: S.ONLINE, bio: "",
          });
          setView("onboard");
          return;
        }

        setUser({
          id: profile.id, name: profile.name, handle: profile.handle,
          initials: profile.initials, status: S.ONLINE,
          bio: profile.bio || "",
        });
        setIsVerified(profile.is_verified || false);
        setSubPlan(profile.sub_plan || "monthly");
        if (profile.topics?.length > 0) setSelectedTopics(profile.topics);
        setProfileSettings({
          profilePublic: profile.profile_public ?? true,
          showStatus: profile.show_status ?? true,
          allowConnect: profile.allow_connect ?? true,
          emailNotifs: profile.email_notifs ?? true,
        });
        setView(profile.topics?.length >= 3 ? "home" : "onboard");
      } catch (err) {
        console.error("Failed to load profile:", err);
        // Even on total failure, create a minimal user so the app doesn't hang
        const meta = authUser.user_metadata || {};
        const fallbackName = meta.name || authUser.email?.split("@")[0] || "User";
        setUser({
          id: authUser.id,
          name: fallbackName,
          handle: "@" + fallbackName.toLowerCase().replace(/\s+/g, ""),
          initials: fallbackName.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2),
          status: S.ONLINE, bio: "",
        });
        setView("onboard");
      }
    };

    // Safety timeout — if Supabase never responds, stop loading after 5s
    const safetyTimer = setTimeout(() => {
      setAuthLoading(false);
    }, 5000);

    // Check existing session
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) loadProfile(session.user);
        setAuthLoading(false);
        clearTimeout(safetyTimer);
      })
      .catch((err) => {
        console.error("Auth session check failed:", err);
        setAuthLoading(false);
        clearTimeout(safetyTimer);
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          await loadProfile(session.user);
        } else {
          setUser(null);
          setView("auth");
        }
      }
    );
    return () => {
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []);

  // ── LOAD ROOMS FROM SUPABASE ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    const loadRooms = async () => {
      const { data } = await supabase
        .from("rooms").select("*").order("created_at", { ascending: false });
      if (data) {
        setRooms(data.map(r => ({
          id: r.id, name: r.name, desc: r.description || "No description yet.",
          type: r.type, creatorId: r.creator_id, memberCount: 1,
          limit: r.member_limit, pinned: r.pinned_conclusion,
          schedule: r.schedule_date && r.schedule_time ? { date: r.schedule_date, time: r.schedule_time } : null,
        })));
        // Load pinned conclusions
        const pinnedMap = {};
        data.forEach(r => { if (r.pinned_conclusion) pinnedMap[r.id] = r.pinned_conclusion; });
        setPinned(pinnedMap);
      }
    };
    loadRooms();

    // Load room creation count for today (circle limit)
    const loadCreationCount = async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("room_creations").select("created_at")
        .eq("user_id", user.id).gte("created_at", oneDayAgo);
      if (data) setRoomsCreatedToday(data.map(r => new Date(r.created_at).getTime()));
    };
    loadCreationCount();
  }, [user]);

  // ── LOAD MESSAGES FOR ACTIVE ROOM + REALTIME ─────────────
  useEffect(() => {
    if (!activeRoom) return;
    const roomId = activeRoom.id;

    const loadMessages = async () => {
      const { data } = await supabase
        .from("messages").select("*, profiles:author_id(name, initials, avatar_color)")
        .eq("room_id", roomId).order("created_at", { ascending: true });
      if (data) {
        setAllMessages(prev => ({
          ...prev,
          [roomId]: data.map(m => ({
            id: m.id, author: m.profiles?.name || "Unknown",
            role: m.author_id === activeRoom.creatorId ? "owner" : "member",
            time: new Date(m.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
            initials: m.profiles?.initials || "??",
            grad: m.profiles?.avatar_color || "linear-gradient(135deg,#E8845A,#C4624A)",
            content: m.body, replyTo: null, reactions: m.reactions || [],
            imageUrl: m.image_url || null,
          })),
        }));
      }
    };
    loadMessages();

    // Realtime subscription for new messages
    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` },
        async (payload) => {
          const m = payload.new;
          // Fetch the author profile
          const { data: profile } = await supabase
            .from("profiles").select("name, initials, avatar_color").eq("id", m.author_id).single();
          setAllMessages(prev => ({
            ...prev,
            [roomId]: [...(prev[roomId] || []), {
              id: m.id, author: profile?.name || "Unknown",
              role: m.author_id === activeRoom.creatorId ? "owner" : "member",
              time: new Date(m.created_at).toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
              initials: profile?.initials || "??",
              grad: profile?.avatar_color || "linear-gradient(135deg,#E8845A,#C4624A)",
              content: m.body, replyTo: null, reactions: m.reactions || [],
              imageUrl: m.image_url || null,
            }],
          }));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeRoom]);

  useEffect(() => { msgsEnd.current?.scrollIntoView({ behavior:"smooth" }); }, [allMessages, activeRoom]);

  useEffect(() => {
    const h = e => { if (!searchRef.current?.contains(e.target)) setShowSearch(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = e => {
      if (showNotifs && !e.target.closest(".notif-panel") && !e.target.closest(".ico-btn"))
        setShowNotifs(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showNotifs]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Accepted connections only
  const acceptedUserIds = Object.entries(connStates).filter(([,s]) => s === CS.ACCEPTED).map(([id]) => id);

  // Search results
  const searchResults = searchQ.length > 1 ? [
    ...rooms.filter(r => r.name.toLowerCase().includes(searchQ.toLowerCase()))
            .map(r => ({ type:"room", id:r.id, label:r.name, sub:r.type === "public" ? "Public Room" : "Private Room", ico:"◈" })),
    ...DEMO_USERS.filter(u =>
        u.name.toLowerCase().includes(searchQ.toLowerCase()) ||
        u.handle.toLowerCase().includes(searchQ.toLowerCase()))
            .map(u => ({ type:"person", id:u.id, label:u.name, sub:u.handle, ico:"◉", status:u.status })),
  ].slice(0, 7) : [];

  // ── ADD NOTIFICATION ─────────────────────────────────────
  const addNotif = useCallback((text, type = "system", meta = null) => {
    setNotifications(prev => [{
      id: Date.now(), type, text, meta, read: false,
      time: new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" }),
    }, ...prev]);
  }, []);

  // ── SHOW SUCCESS TOAST ───────────────────────────────────
  const showToast = useCallback((msg) => {
    setSuccessToast(msg);
    setTimeout(() => setSuccessToast(null), 3000);
  }, []);

  // ── REQUEST GEO LOCATION ────────────────────────────────
  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoEnabled(true);
      },
      () => { setGeoEnabled(false); }
    );
  }, []);

  // ── JOIN DISCOVER ROOM ──────────────────────────────────
  // Supabase: INSERT INTO room_members (room_id, user_id) VALUES (...)
  const joinDiscoverRoom = useCallback((roomId) => {
    setJoinedRooms(prev => [...prev, roomId]);
    setPublicRooms(prev => prev.map(r => r.id === roomId ? { ...r, memberCount: r.memberCount + 1 } : r));
    const room = publicRooms.find(r => r.id === roomId);
    showToast(`Joined "${room?.name}" — check My Rooms!`);
  }, [publicRooms, showToast]);

  // ── LEAVE DISCOVER ROOM ─────────────────────────────────
  // Supabase: DELETE FROM room_members WHERE room_id=? AND user_id=?
  const leaveDiscoverRoom = useCallback((roomId) => {
    setJoinedRooms(prev => prev.filter(id => id !== roomId));
    setPublicRooms(prev => prev.map(r => r.id === roomId ? { ...r, memberCount: Math.max(0, r.memberCount - 1) } : r));
    showToast("Left the room.");
  }, [showToast]);

  // ── SEND DM (fully persistent via Supabase) ────────────
  const sendDM = useCallback(async () => {
    const text = dmMsg.trim();
    if (!text || !activeConversationId) return;
    if (hasProfanity(text)) { setProfWarn(true); setTimeout(() => setProfWarn(false), 3000); return; }
    setDmMsg("");
    await sendDMMessage(activeConversationId, text, addOptimisticMessage);
  }, [dmMsg, activeConversationId, sendDMMessage, addOptimisticMessage]);

  // ── START DM CONVERSATION ───────────────────────────────
  const startDMWithUser = useCallback(async (otherUserId) => {
    try {
      const { conversation } = await createConversation(otherUserId);
      setActiveConversationId(conversation.id);
      setView("messages");
      refreshConversations();
    } catch (err) {
      console.error("Failed to start conversation:", err);
    }
  }, [refreshConversations]);

  // ── IMAGE ATTACH ────────────────────────────────────────
  // Supabase: supabase.storage.from('chat-files').upload(path, file) then store public URL in messages table
  const handleFileAttach = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File too large. Max size is 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAttachedImg(reader.result); // base64 data URL
    reader.readAsDataURL(file);
  }, []);

  // ── START PREMIUM (from Premium modal) ──────────────────
  // Supabase: Stripe Checkout → webhook → UPDATE profiles SET verified=true
  const handleStartPremium = useCallback(async () => {
    setIsVerified(true);
    setShowPremium(false);
    if (user) {
      await supabase.from("profiles").update({ is_verified: true, sub_plan: "monthly" }).eq("id", user.id);
    }
    showToast("⭐ You're now Orbit Thread Premium!");
    addNotif("⭐ <strong>Welcome to Orbit Thread Premium!</strong> Verified badge, unlimited rooms, and more are now yours.");
  }, [user, showToast, addNotif]);

  // ── SEND CONNECTION REQUEST ──────────────────────────────
  // This is the new flow: NONE → PENDING_SENT
  // Also creates an "incoming" notification for the other user (simulated)
  const sendRequest = useCallback((targetUser) => {
    setConnStates(prev => ({ ...prev, [targetUser.id]: CS.PENDING_SENT }));

    // In Phase 2: Supabase INSERT into `connections` table with status='pending'
    // Then Supabase Realtime pushes a notification to the target user's device
    addNotif(
      `Connection request sent to <strong>${targetUser.name}</strong>. Waiting for them to accept.`,
      "request_sent"
    );

    // Simulate: after 2 seconds, the "other user" sees the incoming request
    // In Phase 2 this is replaced by a real Supabase Realtime event
    setTimeout(() => {
      addNotif(
        `<strong>${targetUser.name}</strong> received your request. Accept it for them?`,
        "incoming_simulation",
        { userId: targetUser.id, userName: targetUser.name }
      );
    }, 2000);
  }, [addNotif]);

  // ── ACCEPT CONNECTION ─────────────────────────────────────
  // Both sides become ACCEPTED → chat/call/message unlocked
  const acceptConnection = useCallback((userId, userName) => {
    setConnStates(prev => ({ ...prev, [userId]: CS.ACCEPTED }));
    setNotifications(prev => prev.map(n =>
      n.meta?.userId === userId ? { ...n, read: true } : n
    ));
    addNotif(
      `🎉 You're now connected with <strong>${userName}</strong>! You can now chat, call, and message each other.`,
      "accepted"
    );
  }, [addNotif]);

  // ── DECLINE CONNECTION ────────────────────────────────────
  const declineConnection = useCallback((userId, userName) => {
    setConnStates(prev => ({ ...prev, [userId]: CS.NONE }));
    setNotifications(prev => prev.map(n =>
      n.meta?.userId === userId ? { ...n, read: true } : n
    ));
    addNotif(`Connection request from <strong>${userName}</strong> was declined.`, "declined");
  }, [addNotif]);

  // ── SEND MESSAGE ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = newMsg.trim();
    if (!text && !attachedImg) return; // allow image-only messages
    if (!activeRoom || !user) return;
    if (text && hasProfanity(text)) { setProfWarn(true); setTimeout(() => setProfWarn(false), 3000); return; }

    // Supabase: supabase.storage.from('chat-files').upload(path, file) for real image upload
    const { error } = await supabase.from("messages").insert({
      room_id: activeRoom.id,
      author_id: user.id,
      body: text || (attachedImg ? "📎 Image" : ""),
      image_url: attachedImg || null,
    });
    if (error) { console.error("Send message error:", error); return; }
    setNewMsg(""); setReplyingTo(null); setAttachedImg(null);
  }, [newMsg, activeRoom, user, replyingTo, attachedImg]);

  // ── CREATE ROOM ──────────────────────────────────────────
  const createRoom = async () => {
    if (!createForm.name.trim() || !user) return;
    // ── CIRCLE LIMIT CHECK ──
    if (!isVerified) {
      const now = Date.now();
      const recent = roomsCreatedToday.filter(ts => now - ts < 24 * 60 * 60 * 1000);
      if (recent.length >= DAILY_LIMIT) {
        addNotif("⚠️ You've reached your daily limit of <strong>5 Circles</strong>. Get <strong>Verified</strong> in Settings for unlimited rooms!");
        return;
      }
    }
    const memberLimit = createForm.limit === "Custom"
      ? Math.min(1000, parseInt(createForm.customLimit) || 50)
      : parseInt(createForm.limit);

    // Get geo data for public rooms
    const geoLat = createForm.visibility === "public" && userGeo ? userGeo.lat : null;
    const geoLng = createForm.visibility === "public" && userGeo ? userGeo.lng : null;
    const geoRadius = createForm.visibility === "public" ? createForm.radius : null;

    const { data: room, error } = await supabase.from("rooms").insert({
      name: createForm.name.trim(),
      description: createForm.purpose.trim() || "No description yet.",
      type: createForm.visibility,
      creator_id: user.id,
      member_limit: memberLimit,
      schedule_date: createForm.date || null,
      schedule_time: createForm.time || null,
      // Phase 2: geo columns — store radius, lat, lng on the room object
      // radius: geoRadius, lat: geoLat, lng: geoLng,
    }).select().single();

    if (error) { console.error("Create room error:", error); return; }

    // Track creation for daily limit
    await supabase.from("room_creations").insert({ user_id: user.id });

    // Build radius label for notification
    const radiusLabel = RADIUS_OPTIONS.find(r => r.value === createForm.radius)?.label || "Worldwide";

    // Add to local state (with geo data)
    setRooms(prev => [{
      id: room.id, name: room.name, desc: room.description,
      type: room.type, creatorId: room.creator_id, memberCount: 1,
      limit: room.member_limit,
      radius: geoRadius, lat: geoLat, lng: geoLng,
      schedule: room.schedule_date && room.schedule_time ? { date: room.schedule_date, time: room.schedule_time } : null,
    }, ...prev]);

    // Also add self as room member
    await supabase.from("room_members").insert({ room_id: room.id, user_id: user.id, role: "owner" });

    setRoomsCreatedToday(prev => [...prev, Date.now()]);
    setShowCreate(false);
    setCreateForm({ name:"", purpose:"", visibility:"public", limit:"50", customLimit:"", date:"", time:"", radius:99999 });

    if (createForm.visibility === "public") {
      addNotif(`📡 Your room <strong>${room.name}</strong> is now discoverable — radius: <strong>${radiusLabel}</strong>`);
    } else {
      addNotif(`Your room <strong>${room.name}</strong> is ready. Invite your people.`);
    }
  };

  const deleteRoom = async (id) => {
    if (!window.confirm("Delete this room permanently?")) return;
    await supabase.from("rooms").delete().eq("id", id);
    setRooms(prev => prev.filter(r => r.id !== id));
    setAllMessages(prev => { const n = {...prev}; delete n[id]; return n; });
    setPinned(prev => { const n = {...prev}; delete n[id]; return n; });
    setView("home"); setActiveRoom(null);
  };

  const pinConclusion = async (roomId) => {
    const text = window.prompt("Write the final conclusion or decision for this room:");
    if (!text?.trim()) return;
    await supabase.from("rooms").update({ pinned_conclusion: text.trim(), pinned_by: user.id }).eq("id", roomId);
    setPinned(prev => ({ ...prev, [roomId]: text.trim() }));
    addNotif(`Conclusion pinned in <strong>${activeRoom?.name}</strong>.`);
  };

  const toggleReaction = (msgId, type) => {
    if (!activeRoom) return;
    setAllMessages(prev => ({
      ...prev,
      [activeRoom.id]: (prev[activeRoom.id] || []).map(m =>
        m.id === msgId ? { ...m, reactions: m.reactions.includes(type) ? m.reactions.filter(r=>r!==type) : [...m.reactions, type] } : m
      ),
    }));
  };

  // Calendar exports
  const fmt = d => d.toISOString().replace(/[-:.]/g,"").slice(0,15)+"Z";
  const downloadICS = (room) => {
    if (!room?.schedule) return;
    const dt = new Date(`${room.schedule.date}T${room.schedule.time}`);
    const end = new Date(dt.getTime() + 7200000);
    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OrbitThread//EN\nBEGIN:VEVENT\nSUMMARY:${room.name} · Orbit Thread\nDTSTART:${fmt(dt)}\nDTEND:${fmt(end)}\nDESCRIPTION:${room.desc}\nEND:VEVENT\nEND:VCALENDAR`;
    Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([ics],{type:"text/calendar"})), download:`${room.name}-orbit-thread.ics` }).click();
  };
  const openGCal = (room) => {
    if (!room?.schedule) return;
    const dt = new Date(`${room.schedule.date}T${room.schedule.time}`);
    const end = new Date(dt.getTime() + 7200000);
    window.open(`https://calendar.google.com/calendar/r/eventedit?text=${encodeURIComponent(room.name+" · Orbit Thread")}&dates=${fmt(dt)}/${fmt(end)}&details=${encodeURIComponent(room.desc)}`, "_blank");
  };

  const enterRoom = (room) => { setActiveRoom(room); setRoomTab("discussion"); setView("room"); };

  // ── AUTH: SIGNUP + LOGIN ─────────────────────────────────
  const login = async () => {
    setAuthError("");
    if (!email.trim()) return setAuthError("Enter your email address.");

    if (authMode === "signup") {
      if (!authName.trim()) return setAuthError("Enter your name.");
      if (!authPassword || authPassword.length < 6) return setAuthError("Password must be at least 6 characters.");
    } else {
      if (!authPassword) return setAuthError("Enter your password.");
    }

    setLoginLoading(true);
    try {
      // 30-second timeout to prevent infinite hang
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timed out. Check your internet and try again.")), 30000)
      );

      if (authMode === "signup") {
        const initials = authName.trim().split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
        const handle = "@" + authName.trim().toLowerCase().replace(/\s+/g, "");
        const { data, error } = await Promise.race([
          supabase.auth.signUp({
            email: email.trim(),
            password: authPassword,
            options: { data: { name: authName.trim(), handle, initials } },
          }),
          timeout,
        ]);
        if (error) { setAuthError(typeof error === "string" ? error : error?.message || JSON.stringify(error)); return; }
        // If email confirmation is required, signUp succeeds but session is null
        if (data && !data.session) {
          setAuthError("Check your email for a confirmation link, then sign in.");
          return;
        }
      } else {
        const { data, error } = await Promise.race([
          supabase.auth.signInWithPassword({
            email: email.trim(),
            password: authPassword,
          }),
          timeout,
        ]);
        if (error) { setAuthError(typeof error === "string" ? error : error?.message || JSON.stringify(error)); return; }
        // If sign-in succeeds but no session returned (shouldn't happen, but safety net)
        if (data && !data.session) {
          setAuthError("Sign-in succeeded but no session was created. Try again or check your email for a confirmation link.");
          return;
        }
      }
    } catch (err) {
      console.error("Auth error:", err);
      setAuthError(err?.message || "Something went wrong. Please try again.");
    } finally {
      setLoginLoading(false);
    }
  };

  const loginWithGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) setAuthError(error.message);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setView("auth"); setRooms([]); setNotifications([]);
    setAllMessages({}); setPinned({}); setEmail(""); setAuthPassword("");
    setAuthName(""); setAuthMode("login"); setAuthError("");
    setConnStates({ u1: CS.NONE, u2: CS.NONE, u3: CS.NONE, u4: CS.NONE });
    setActiveConversationId(null); setDmMsg("");
    setJoinedRooms([]); setPublicRooms(SEED_ROOMS);
    setHomeTab("my-rooms"); setDiscoverFilter("all");
    setAttachedImg(null); setShowPremium(false);
  };

  const saveOnboardTopics = async () => {
    if (!user || selectedTopics.length < 3) return;
    await supabase.from("profiles").update({ topics: selectedTopics }).eq("id", user.id);
    setView("home");
  };

  const saveSettings = async () => {
    if (!user) return;
    await supabase.from("profiles").update({
      profile_public: profileSettings.profilePublic,
      show_status: profileSettings.showStatus,
      allow_connect: profileSettings.allowConnect,
      email_notifs: profileSettings.emailNotifs,
    }).eq("id", user.id);
    setShowSettings(false);
  };

  // ── RENDER ───────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div className="app">

        {/* ══ AUTH ══ */}
        {view === "auth" && !authLoading && (
          <div className="auth-page">
            <div className="auth-card">
              <div className="auth-top">
                <div className="auth-mark">◈</div>
                <div className="auth-name">Orbit Thread</div>
                <div className="auth-tagline">Think louder, together.</div>
              </div>
              <div className="divider">{authMode === "signup" ? "Sign up" : "Log in"} with email</div>
              {authMode === "signup" && (
                <div className="field">
                  <div className="fl">Full Name</div>
                  <input className="fi" type="text" placeholder="Your name" value={authName} onChange={e => setAuthName(e.target.value)} />
                </div>
              )}
              <div className="field">
                <div className="fl">Email address</div>
                <input className="fi" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <div className="fl">Password</div>
                <input className="fi" type="password" placeholder={authMode === "signup" ? "Min 6 characters" : "Your password"} value={authPassword} onChange={e => setAuthPassword(e.target.value)} onKeyDown={e => e.key==="Enter" && login()} />
              </div>
              {authError && <div style={{color:"#ff6b6b",fontSize:13,marginBottom:10,textAlign:"center",padding:"10px 14px",background:"rgba(255,107,107,0.1)",borderRadius:8,border:"1px solid rgba(255,107,107,0.25)",lineHeight:1.5}}>{authError}</div>}
              <button className="btn-primary full" disabled={!email || !authPassword || loginLoading} onClick={login}>
                {loginLoading ? "Signing in..." : authMode === "signup" ? "Create Account" : "Sign In"}
              </button>
              <div className="auth-foot">
                {authMode === "login"
                  ? <>New here? <a onClick={() => { setAuthMode("signup"); setAuthError(""); }}>Create an account</a></>
                  : <>Already have an account? <a onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign in</a></>
                }
              </div>
              <div className="auth-tos">By continuing you agree to our <a>Terms of Service</a> and <a>Privacy Policy</a>.</div>
            </div>
          </div>
        )}

        {/* ══ AUTH LOADING ══ */}
        {view === "auth" && authLoading && (
          <div className="auth-page">
            <div className="auth-card" style={{textAlign:"center",padding:60}}>
              <div className="auth-mark" style={{animation:"pulse 1.5s ease infinite"}}>◈</div>
              <div style={{marginTop:16,color:"var(--t2)",fontSize:13}}>Loading Orbit Thread...</div>
            </div>
          </div>
        )}

        {/* ══ ONBOARDING ══ */}
        {view === "onboard" && (
          <div className="onb-page">
            <div className="onb-box">
              <div className="onb-step">Step 1 of 2</div>
              <div className="onb-title">What moves your mind?</div>
              <div className="onb-sub">Choose 3 to 5 topics that matter to you. Orbit Thread will build your quiet room around them. Search for anything — every field is here.</div>
              <div className="onb-sw">
                <MagIco className="onb-sico" />
                <input className="onb-si" placeholder="Search any topic in the world..." value={topicSearch} onChange={e => setTopicSearch(e.target.value)} />
              </div>
              <div className="topics-grid">
                {ALL_TOPICS.filter(t => t.toLowerCase().includes(topicSearch.toLowerCase())).map(t => (
                  <div key={t} className={`t-chip${selectedTopics.includes(t)?" sel":""}`} onClick={() =>
                    setSelectedTopics(prev => prev.includes(t) ? prev.filter(x=>x!==t) : prev.length < 5 ? [...prev,t] : prev)
                  }>{t}</div>
                ))}
              </div>
              <button className="btn-primary full" disabled={selectedTopics.length < 3} onClick={saveOnboardTopics}>
                Build My Orbit Thread →
              </button>
              <div className="onb-count">{selectedTopics.length} of 3 required selected · max 5</div>
            </div>
          </div>
        )}

        {/* ══ MAIN LAYOUT ══ */}
        {["home","room","profile","people","messages"].includes(view) && (
          <div className="layout">

            {/* ── SIDEBAR ── */}
            <aside className="sidebar">
              <div className="sb-brand">
                <div className="sb-logomark">◈</div>
                <div className="sb-wordmark">
                  <div className="sb-wordmark-name">Orbit Thread</div>
                  <div className="sb-wordmark-tag">Think louder, together.</div>
                </div>
              </div>

              <div className="sb-sect">Rooms <button className="sb-plus" onClick={() => setShowCreate(true)}>+</button></div>
              {rooms.length === 0
                ? <div className="sb-hint">No rooms yet — create one to start.</div>
                : rooms.map(r => (
                  <div key={r.id} className={`sb-item${activeRoom?.id===r.id&&view==="room"?" active":""}`} onClick={() => enterRoom(r)}>
                    <span className={`sb-rdot ${r.type==="public"?"rdot-pub":"rdot-priv"}`}></span>
                    <span className="sb-iname">{r.name}</span>
                    {r.type==="private" && <span style={{fontSize:11}}>🔒</span>}
                  </div>
                ))
              }

              <div className="sb-sect" style={{marginTop:12}}>Connections</div>
              {acceptedUserIds.length === 0
                ? <div className="sb-hint">No connections yet. Find people in People tab.</div>
                : DEMO_USERS.filter(u => acceptedUserIds.includes(u.id)).map(u => (
                  <div key={u.id} className="sb-item" onClick={() => setView("people")}>
                    <div className="av av-xs" style={{background:avatarGrad(u.hue)}}>
                      {u.initials}
                      <span className="pip pip-sm" style={{background:SC[u.status]}}></span>
                    </div>
                    <span className="sb-iname">{u.name}</span>
                  </div>
                ))
              }
              {/* Pending incoming requests badge in sidebar */}
              {Object.entries(connStates).some(([,s]) => s === CS.PENDING_INCOMING) && (
                <div style={{margin:"4px 14px"}}>
                  <span className="pending-pill">Pending requests</span>
                </div>
              )}

              {/* Phase 2: Messages nav */}
              <div className="sb-sect" style={{marginTop:12}}>Messages</div>
              <div className={`sb-item${view==="messages"?" active":""}`} onClick={() => setView("messages")} style={{gap:7}}>
                <span style={{fontSize:14}}>💬</span>
                <span className="sb-iname">Direct Messages</span>
                {dmConversations.length > 0 && <span style={{width:6,height:6,borderRadius:"50%",background:"var(--clay)",flexShrink:0}} />}
              </div>

              <div className="sb-footer">
                <div className="sb-user" onClick={() => setView("profile")}>
                  <div className="av av-sm" style={{background:"linear-gradient(135deg,#E8845A,#C4624A)"}}>
                    {user?.initials}
                    <span className="pip pip-sm" style={{background:SC[S.ONLINE]}}></span>
                  </div>
                  <div style={{flex:1, minWidth:0}}>
                    <div className="sb-uname">{user?.name}{isVerified && <span className="verified-badge" title="Verified">✓</span>}{isVerified && <span style={{marginLeft:3}}>⭐</span>}</div>
                    <div className="sb-uhandle">{user?.handle}</div>
                  </div>
                  <button className="sb-gear" onClick={e=>{e.stopPropagation();setShowSettings(true);}}>⚙</button>
                </div>
              </div>
            </aside>

            {/* ── MAIN ── */}
            <div className="main">
              {/* TOPBAR */}
              <div className="topbar">
                <div className="tb-crumb">
                  <span className="tb-live"></span>
                  {view==="home" ? "Orbit Thread" : view==="room" ? activeRoom?.name : view==="profile" ? "Profile" : view==="messages" ? "Messages" : "People"}
                </div>

                <div className="srch-wrap" ref={searchRef}>
                  <MagIco className="srch-ico" />
                  <input className="srch-el" placeholder="Search rooms or people..." value={searchQ}
                    onChange={e => { setSearchQ(e.target.value); setShowSearch(true); }}
                    onFocus={() => setShowSearch(true)} />
                  {showSearch && searchQ.length > 1 && (
                    <div className="srch-drop">
                      {searchResults.length === 0
                        ? <div className="sd-empty">Nothing found for "{searchQ}"</div>
                        : searchResults.map((r,i) => (
                          <div key={i} className="sd-item" onClick={() => {
                            if(r.type==="room"){const rm=rooms.find(x=>x.id===r.id);if(rm)enterRoom(rm);}
                            else setView("people");
                            setSearchQ(""); setShowSearch(false);
                          }}>
                            <span className="sd-ico">{r.ico}</span>
                            <div className="sd-info">
                              <div className="sd-name">{r.label}</div>
                              <div className="sd-sub">{r.type==="person"&&<span style={{color:SC[r.status],marginRight:4}}>●</span>}{r.sub}</div>
                            </div>
                            <span className={`sd-badge ${r.type==="room"?"sdb-room":"sdb-person"}`}>{r.type==="room"?"ROOM":"PERSON"}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>

                <div className="tb-right">
                  <div className="ico-btn" onClick={() => setView("messages")} title="Messages">
                    💬
                  </div>
                  <div className="ico-btn" onClick={() => setShowNotifs(!showNotifs)}>
                    🔔
                    {unreadCount > 0 && <span className="notif-pip">{unreadCount}</span>}
                  </div>
                  <div className="av av-sm" style={{background:"linear-gradient(135deg,#E8845A,#C4624A)",cursor:"pointer"}} onClick={() => setView("profile")}>
                    {user?.initials}
                    <span className="pip pip-sm" style={{background:SC[S.ONLINE]}}></span>
                  </div>
                </div>

                {/* NOTIFICATION PANEL — includes Accept/Decline for requests */}
                {showNotifs && (
                  <div className="notif-panel">
                    <div className="np-head">
                      <h4>Notifications</h4>
                      <button className="np-clear" onClick={() => { setNotifications(prev=>prev.map(n=>({...n,read:true}))); }}>Mark all read</button>
                    </div>
                    {notifications.length === 0 ? (
                      <div className="np-empty">
                        <div className="np-empty-ico">🔔</div>
                        <div className="np-empty-text">Nothing yet. Connection requests, invites, and replies will appear here.</div>
                      </div>
                    ) : notifications.map(n => (
                      <div key={n.id} className={`np-item${!n.read?" unread":""}`} onClick={() => setNotifications(prev=>prev.map(x=>x.id===n.id?{...x,read:true}:x))}>
                        <span className={`np-dot${n.read?" read":""}`}></span>
                        <div className="np-body">
                          <div className="np-text" dangerouslySetInnerHTML={{__html:n.text}} />
                          <div className="np-time">{n.time}</div>
                          {/* ── ACCEPT / DECLINE BUTTONS (the new connection flow) ── */}
                          {n.type === "incoming_simulation" && n.meta && !n.read && (
                            <div className="np-actions" onClick={e => e.stopPropagation()}>
                              <button className="np-accept" onClick={() => acceptConnection(n.meta.userId, n.meta.userName)}>
                                ✓ Accept
                              </button>
                              <button className="np-decline" onClick={() => declineConnection(n.meta.userId, n.meta.userName)}>
                                Decline
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── HOME ── */}
              {view === "home" && (
                <div className="home-wrap">
                  <div className="home-hero">
                    <h2>Welcome back, {user?.name} 👋</h2>
                    <p>Focused rooms for focused minds. No noise, no algorithms — just depth.</p>
                  </div>

                  {/* Phase 2: Home Tabs — My Rooms / Discover */}
                  <div className="home-tabs">
                    <button className={`home-tab${homeTab==="my-rooms"?" active":""}`} onClick={() => setHomeTab("my-rooms")}>
                      🏠 My Rooms
                    </button>
                    <button className={`home-tab${homeTab==="discover"?" active":""}`} onClick={() => setHomeTab("discover")}>
                      🔍 Discover
                    </button>
                  </div>

                  {/* ─── MY ROOMS TAB ─── */}
                  {homeTab === "my-rooms" && (
                    <>
                      {!isVerified && getRoomsRemaining() <= 2 && getRoomsRemaining() > 0 && (
                        <div className="limit-banner">
                          <div className="limit-banner-icon">⏳</div>
                          <div className="limit-banner-text">
                            <div className="limit-banner-title">{getRoomsRemaining()} Circle{getRoomsRemaining()!==1?"s":""} remaining today</div>
                            <div className="limit-banner-sub">Free accounts can create 5 Circles per day</div>
                          </div>
                          <button className="btn-primary" style={{padding:"7px 14px",fontSize:11}} onClick={() => setShowSettings(true)}>Get Verified</button>
                        </div>
                      )}
                      {!isVerified && getRoomsRemaining() <= 0 && (
                        <div className="limit-banner">
                          <div className="limit-banner-icon">🚫</div>
                          <div className="limit-banner-text">
                            <div className="limit-banner-title">Daily limit reached</div>
                            <div className="limit-banner-sub">Upgrade to Verified for unlimited Circles</div>
                          </div>
                          <button className="btn-primary" style={{padding:"7px 14px",fontSize:11}} onClick={() => setShowSettings(true)}>Upgrade</button>
                        </div>
                      )}
                      <div className="home-row">
                        <h3>Your Rooms</h3>
                        <button className="btn-primary" style={{padding:"8px 16px",fontSize:13}} onClick={() => setShowCreate(true)}>+ New Room</button>
                      </div>
                      {rooms.length === 0 && joinedRooms.length === 0 ? (
                        <div className="empty">
                          <div className="empty-ico">◈</div>
                          <div className="empty-title">No rooms yet</div>
                          <div className="empty-sub">Create a public room for open discussion, or a private room for your inner circle.</div>
                          <button className="btn-primary" style={{marginTop:10}} onClick={() => setShowCreate(true)}>Create your first Room</button>
                        </div>
                      ) : (
                        <div className="rooms-grid">
                          <div className="room-card new-card" onClick={() => setShowCreate(true)}>
                            <div style={{fontSize:22}}>+</div>
                            <div style={{fontFamily:"var(--hf)",fontWeight:600,fontSize:13}}>New Room</div>
                            <div style={{fontSize:10,opacity:0.7,letterSpacing:"0.05em",textTransform:"uppercase"}}>
                              {isVerified ? "Unlimited" : `${getRoomsRemaining()} left today`}
                            </div>
                          </div>
                          {rooms.map(r => (
                            <div key={r.id} className="room-card" onClick={() => enterRoom(r)}>
                              <div className="rc-type">{r.type==="public"?"🌐":"🔒"}</div>
                              <div className="rc-name">{r.name}</div>
                              <div className="rc-desc">{r.desc}</div>
                              {r.type === "public" && r.radius && (
                                <div style={{marginBottom:10}}>
                                  <span className="geo-badge">📡 {RADIUS_OPTIONS.find(o=>o.value===r.radius)?.label || "Worldwide"}</span>
                                </div>
                              )}
                              <div className="rc-foot">
                                <div className="rc-mem">
                                  <div className="rc-avs">{[...Array(Math.min(r.memberCount,3))].map((_,i)=><div key={i} className="rc-av">{i+1}</div>)}</div>
                                  <span>{r.memberCount}</span>
                                </div>
                                <button className="btn-enter" onClick={e=>{e.stopPropagation();enterRoom(r);}}>Enter</button>
                              </div>
                            </div>
                          ))}
                          {/* Show joined discover rooms in My Rooms */}
                          {publicRooms.filter(r => joinedRooms.includes(r.id)).map(r => (
                            <div key={r.id} className="room-card">
                              <div className="rc-type">🌐</div>
                              <div className="rc-name">{r.name}</div>
                              <div className="rc-desc">{r.desc}</div>
                              {r.radius && (
                                <div style={{marginBottom:10}}>
                                  <span className="geo-badge">📡 {RADIUS_OPTIONS.find(o=>o.value===r.radius)?.label || "Worldwide"}</span>
                                </div>
                              )}
                              <div className="rc-foot">
                                <div className="rc-mem">
                                  <span>{r.memberCount} members</span>
                                </div>
                                <button className="btn-leave" onClick={() => leaveDiscoverRoom(r.id)}>Leave</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* ─── DISCOVER TAB ─── */}
                  {homeTab === "discover" && (() => {
                    // Supabase: SELECT * FROM rooms WHERE visibility='public' ORDER BY created_at DESC
                    let filtered = publicRooms;
                    if (discoverFilter !== "all") {
                      filtered = filtered.filter(r => r.topic.toLowerCase() === discoverFilter.toLowerCase());
                    }
                    // Near me filtering
                    if (geoEnabled && userGeo) {
                      filtered = filtered.filter(r => {
                        if (!r.lat || !r.lng) return true;
                        const dist = haversineMiles(userGeo.lat, userGeo.lng, r.lat, r.lng);
                        return dist <= r.radius;
                      });
                    }
                    return (
                      <>
                        <div className="discover-filters">
                          {DISCOVER_TOPICS.map(t => (
                            <button key={t} className={`filter-chip${discoverFilter===t.toLowerCase()||( t==="All"&&discoverFilter==="all")?" sel":""}`}
                              onClick={() => setDiscoverFilter(t === "All" ? "all" : t)}>
                              {t}
                            </button>
                          ))}
                          <button className={`nearme-toggle${geoEnabled?" on":""}`} onClick={() => {
                            if (!geoEnabled) requestGeo(); else setGeoEnabled(false);
                          }}>
                            📍 {geoEnabled ? "Near me ✓" : "Near me"}
                          </button>
                        </div>
                        {filtered.length === 0 ? (
                          <div className="empty">
                            <div className="empty-ico">🔍</div>
                            <div className="empty-title">No rooms found</div>
                            <div className="empty-sub">Try a different filter or expand your radius.</div>
                          </div>
                        ) : (
                          <div className="discover-grid">
                            {filtered.map(r => {
                              const isJoined = joinedRooms.includes(r.id);
                              return (
                                <div key={r.id} className="discover-card">
                                  <div className="dc-header">
                                    <div className="dc-name">{r.name}</div>
                                    <span className="geo-badge">📡 {RADIUS_OPTIONS.find(o=>o.value===r.radius)?.label || "Worldwide"}</span>
                                  </div>
                                  <div className="dc-creator">by {r.creatorName}</div>
                                  <div className="dc-desc">{r.desc}</div>
                                  <div className="dc-foot">
                                    <div className="dc-meta">
                                      <span className="dc-members">👥 {r.memberCount}</span>
                                      <span style={{padding:"2px 8px",background:"rgba(92,184,130,0.1)",borderRadius:"var(--r99)",fontSize:10,fontWeight:600,color:"var(--sage)"}}>{r.topic}</span>
                                    </div>
                                    {isJoined ? (
                                      <button className="btn-open" onClick={() => showToast(`Opening "${r.name}"…`)}>Open</button>
                                    ) : (
                                      <button className="btn-join" onClick={() => joinDiscoverRoom(r.id)}>+ Join</button>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ── ROOM DETAIL ── */}
              {view === "room" && activeRoom && (() => {
                const msgs = allMessages[activeRoom.id] || [];
                const isOwner = activeRoom.creatorId === user?.id;
                const conclusion = pinned[activeRoom.id];
                return (
                  <div className="room-detail">
                    <div className="rd-header">
                      <button className="back-btn" onClick={() => setView("home")}>← Rooms</button>
                      <div className="rd-title-area">
                        <div className="rd-row">
                          <h2>{activeRoom.name}</h2>
                          <span className={`badge ${activeRoom.type==="public"?"badge-pub":"badge-priv"}`}>{activeRoom.type==="public"?"🌐 Public":"🔒 Private"}</span>
                        </div>
                        <div className="rd-meta">{activeRoom.memberCount} member{activeRoom.memberCount!==1?"s":""} · {activeRoom.type==="public"?"Open to everyone":"Invite only"}</div>
                      </div>
                      <div className="rd-actions">
                        <div className="abt g" title="Voice Call" onClick={() => setShowCall({type:"voice",room:activeRoom})}>📞</div>
                        <div className="abt" title="Video Call"   onClick={() => setShowCall({type:"video",room:activeRoom})}>📹</div>
                        {activeRoom.type==="private" && isOwner && <div className="abt" title="Invite" onClick={() => setShowInvite(true)}>👥</div>}
                        {isOwner && <div className="abt r" title="Delete" onClick={() => deleteRoom(activeRoom.id)}>🗑</div>}
                      </div>
                    </div>

                    <div className="tabs">
                      {["discussion","members","schedule"].map(t => (
                        <button key={t} className={`tab${roomTab===t?" active":""}`} onClick={() => setRoomTab(t)}>{t}</button>
                      ))}
                    </div>

                    {roomTab === "discussion" && (
                      <>
                        {conclusion && (
                          <div className="pinned">
                            <div className="pinned-tag">📌 Conclusion <span className="pinned-by">Pinned by owner</span></div>
                            <div className="pinned-body">{conclusion}</div>
                          </div>
                        )}
                        {isOwner && !conclusion && msgs.length > 0 && (
                          <div style={{padding:"8px 16px",borderBottom:"1px solid var(--b0)",flexShrink:0}}>
                            <button className="btn-ghost" style={{fontSize:12,padding:"6px 12px"}} onClick={() => pinConclusion(activeRoom.id)}>📌 Pin a Conclusion</button>
                          </div>
                        )}
                        <div className="msgs">
                          {msgs.length === 0 && (
                            <div className="empty">
                              <div className="empty-ico">💬</div>
                              <div className="empty-title">Start the conversation</div>
                              <div className="empty-sub">{activeRoom.type==="public"?"Public room — anyone on Orbit Thread can read and post here.":"Private room — focused, invite-only discussion."}</div>
                            </div>
                          )}
                          {msgs.map(m => (
                            <div key={m.id} className="msg">
                              <div className="msg-head">
                                <div className="msg-av" style={{background:m.grad}}>{m.initials}</div>
                                <span className="msg-name">{m.author}</span>
                                <span className={`msg-role mr-${m.role}`}>{m.role.toUpperCase()}</span>
                                <span className="msg-time">{m.time}</span>
                              </div>
                              {m.replyTo && <div className="msg-reply">Replying to <span>@{m.replyTo}</span></div>}
                              <div className="msg-body">{m.content}</div>
                              {m.imageUrl && <img src={m.imageUrl} className="msg-img" alt="Attached" />}
                              <div className="msg-foot">
                                <button className={`react-btn${m.reactions.includes("insightful")?" on":""}`} onClick={()=>toggleReaction(m.id,"insightful")}>💡 Insightful</button>
                                <button className={`react-btn${m.reactions.includes("helpful")?" on":""}`} onClick={()=>toggleReaction(m.id,"helpful")}>🤝 Helpful</button>
                                <button className={`react-btn${m.reactions.includes("trusted")?" on":""}`} onClick={()=>toggleReaction(m.id,"trusted")}>⭐ Trusted</button>
                                <span className="reply-link" onClick={() => setReplyingTo(m.author)}>Reply</span>
                              </div>
                            </div>
                          ))}
                          <div ref={msgsEnd} />
                        </div>
                        {replyingTo && (
                          <div className="reply-bar">
                            <span>Replying to <strong>@{replyingTo}</strong></span>
                            <button onClick={() => setReplyingTo(null)}>✕</button>
                          </div>
                        )}
                        {/* Phase 2: Image preview above composer */}
                        {attachedImg && (
                          <div className="img-preview">
                            <img src={attachedImg} alt="Attached" />
                            <span style={{fontSize:12,color:"var(--t2)"}}>Image attached</span>
                            <button className="img-preview-remove" onClick={() => setAttachedImg(null)}>✕</button>
                          </div>
                        )}
                        <div className="composer">
                          <div className="cmp-inner">
                            {/* Phase 2: Paperclip button for image upload */}
                            <input type="file" accept="image/*" ref={fileRef} style={{display:"none"}} onChange={handleFileAttach} />
                            <button className="cmp-attach" onClick={() => fileRef.current?.click()} title="Attach image">📎</button>
                            <textarea className="cmp-ta" rows={1} placeholder={activeRoom.type==="public"?"Share your thoughts publicly...":"Write to your room..."} value={newMsg} onChange={e=>setNewMsg(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}} />
                            <button className="cmp-send" onClick={sendMessage}>→</button>
                          </div>
                        </div>
                      </>
                    )}

                    {roomTab === "members" && (
                      <div className="people-scroll">
                        {activeRoom.type==="public" && (
                          <div style={{padding:"9px 12px",background:"rgba(92,184,130,0.06)",border:"1px solid rgba(92,184,130,0.12)",borderRadius:"var(--r8)",fontSize:12,color:"var(--t1)",marginBottom:4}}>
                            🌐 Public room — anyone on Orbit Thread can participate.
                          </div>
                        )}
                        <div className="person-card">
                          <div className="av av-md" style={{background:"linear-gradient(135deg,#E8845A,#C4624A)"}}>
                            {user?.initials}
                            <span className="pip pip-md" style={{background:SC[S.ONLINE]}}></span>
                          </div>
                          <div className="p-info"><div className="p-name">{user?.name} (you)</div><div className="p-handle">{user?.handle}</div></div>
                          <span className="badge badge-pub">OWNER</span>
                        </div>
                        {DEMO_USERS.map(u => (
                          <div key={u.id} className="person-card">
                            <div className="av av-md" style={{background:avatarGrad(u.hue)}}>
                              {u.initials}
                              <span className="pip pip-md" style={{background:SC[u.status]}}></span>
                            </div>
                            <div className="p-info">
                              <div className="p-name">{u.name}</div>
                              <div className="p-status"><span style={{color:SC[u.status]}}>●</span><span style={{color:"var(--t2)"}}>{SL[u.status]}</span></div>
                            </div>
                            {connStates[u.id] === CS.ACCEPTED && (
                              <div className="call-btns">
                                <div className="call-mini g" onClick={()=>setShowCall({type:"voice",room:{name:u.name}})}>📞</div>
                                <div className="call-mini" onClick={()=>setShowCall({type:"video",room:{name:u.name}})}>📹</div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {roomTab === "schedule" && (
                      <div style={{flex:1,overflowY:"auto",padding:16}}>
                        {activeRoom.schedule ? (
                          <div style={{background:"var(--surf)",border:"1px solid var(--b1)",borderRadius:"var(--r12)",padding:18}}>
                            <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.09em",textTransform:"uppercase",color:"var(--t2)",marginBottom:8}}>Upcoming Session</div>
                            <div style={{fontFamily:"var(--hf)",fontSize:16,fontWeight:600,marginBottom:4}}>{activeRoom.name}</div>
                            <div style={{fontSize:13,color:"var(--t1)",marginBottom:16}}>📅 {activeRoom.schedule.date} at {activeRoom.schedule.time}</div>
                            <div className="cal-row">
                              <button className="btn-ghost" style={{fontSize:12}} onClick={() => openGCal(activeRoom)}>📅 Google Calendar</button>
                              <button className="btn-ghost" style={{fontSize:12}} onClick={() => downloadICS(activeRoom)}>⬇ Download .ics</button>
                            </div>
                          </div>
                        ) : (
                          <div className="empty"><div className="empty-ico">📅</div><div className="empty-title">No session scheduled</div><div className="empty-sub">Set a date when creating a private room to generate calendar invites.</div></div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── PEOPLE VIEW — Connection Request Flow ── */}
              {view === "people" && (
                <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
                  <div className="people-scroll">
                    <div className="people-intro">
                      <h3>People on Orbit Thread</h3>
                      <p>Send a connection request. Once accepted, you can chat, call, and message each other privately.</p>
                    </div>

                    {DEMO_USERS.map(u => {
                      const cs = connStates[u.id];
                      const isAccepted = cs === CS.ACCEPTED;
                      return (
                        <div key={u.id} className="person-card" style={{animation:"fadeUp 0.2s ease"}}>
                          <div className="av av-md" style={{background:avatarGrad(u.hue)}}>
                            {u.initials}
                            <span className="pip pip-md" style={{background:SC[u.status]}}></span>
                          </div>
                          <div className="p-info">
                            <div className="p-name">{u.name}</div>
                            <div className="p-handle">{u.handle}</div>
                            <div className="p-status"><span style={{color:SC[u.status]}}>●</span><span style={{color:"var(--t2)"}}>{SL[u.status]}</span></div>
                            <div className="p-bio">{u.bio}</div>
                            <div className="p-tags">{u.expertise.map(e=><span key={e} className="p-tag">{e}</span>)}</div>
                          </div>

                          <div className="p-actions">
                            {/* ── CONNECTION BUTTON — 4 states ── */}
                            {cs === CS.NONE && (
                              <button className="conn-btn conn-none" onClick={() => sendRequest(u)}>
                                + Connect
                              </button>
                            )}
                            {cs === CS.PENDING_SENT && (
                              <button className="conn-btn conn-sent" disabled>
                                ⏳ Request Sent
                              </button>
                            )}
                            {cs === CS.PENDING_INCOMING && (
                              <>
                                <button className="conn-btn conn-incoming" onClick={() => acceptConnection(u.id, u.name)}>
                                  ✓ Accept
                                </button>
                                <button className="btn-ghost" style={{fontSize:11,padding:"5px 10px"}} onClick={() => declineConnection(u.id, u.name)}>
                                  Decline
                                </button>
                              </>
                            )}
                            {cs === CS.ACCEPTED && (
                              <>
                                <button className="conn-btn conn-accepted" onClick={() => setConnStates(prev=>({...prev,[u.id]:CS.NONE}))}>
                                  ✓ Connected
                                </button>
                                {/* Call buttons — ONLY available when connected */}
                                <div className="call-btns">
                                  <div className="call-mini g" title="Voice Call" onClick={() => setShowCall({type:"voice",room:{name:u.name}})}>📞</div>
                                  <div className="call-mini" title="Video Call"   onClick={() => setShowCall({type:"video",room:{name:u.name}})}>📹</div>
                                </div>
                              </>
                            )}
                            {/* Show locked hint when not connected */}
                            {cs === CS.NONE && (
                              <div className="lock-hint">🔒 Connect to call & chat</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── MESSAGES (DMs) — Fully Persistent via Supabase ── */}
              {view === "messages" && (
                <div className="dm-layout">
                  {/* DM Sidebar — list of real conversations */}
                  <div className="dm-sidebar">
                    <div className="dm-sb-head">Messages</div>
                    <div className="dm-list">
                      {dmConvLoading ? (
                        <div className="dm-empty-sb">
                          <div className="dm-empty-sb-text">Loading conversations...</div>
                        </div>
                      ) : dmConversations.length === 0 ? (
                        <div className="dm-empty-sb">
                          <div className="dm-empty-sb-ico">💬</div>
                          <div className="dm-empty-sb-text">No conversations yet. Connect with people and start a chat!</div>
                        </div>
                      ) : (
                        dmConversations.map(conv => {
                          const ou = conv.other_user;
                          return (
                            <div key={conv.id} className={`dm-item${activeConversationId===conv.id?" active":""}`} onClick={() => setActiveConversationId(conv.id)}>
                              <div className="av av-sm" style={{background:ou.avatar_color || "linear-gradient(135deg,#E8845A,#C4624A)"}}>
                                {ou.initials || "??"}
                                <span className="pip pip-sm" style={{background:SC[ou.status] || SC.offline}}></span>
                              </div>
                              <div className="dm-item-info">
                                <div className="dm-item-name">{ou.name}{ou.is_verified && <span style={{marginLeft:4}}>⭐</span>}</div>
                                <div className="dm-item-preview">{conv.last_message ? conv.last_message.content : "No messages yet"}</div>
                              </div>
                              {conv.last_message && <span className="dm-item-time">{new Date(conv.last_message.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                  {/* DM Chat Area */}
                  <div className="dm-main">
                    {!activeConversationId ? (
                      <div className="dm-no-select">
                        <div className="dm-no-select-ico">💬</div>
                        <div className="dm-no-select-text">Select a conversation to start messaging</div>
                      </div>
                    ) : (() => {
                      const activeConv = dmConversations.find(c => c.id === activeConversationId);
                      const dmUser = activeConv?.other_user || { name:"Unknown", initials:"??", avatar_color:"linear-gradient(135deg,#E8845A,#C4624A)", status:"offline" };
                      return (
                        <>
                          <div className="dm-header">
                            <div className="av av-sm" style={{background:dmUser.avatar_color || "linear-gradient(135deg,#E8845A,#C4624A)"}}>
                              {dmUser.initials || "??"}
                              <span className="pip pip-sm" style={{background:SC[dmUser.status] || SC.offline}}></span>
                            </div>
                            <div>
                              <div className="dm-header-name">{dmUser.name}{dmUser.is_verified && <span style={{marginLeft:4}}>⭐</span>}</div>
                              <div className="dm-header-status"><span style={{color:SC[dmUser.status] || SC.offline}}>●</span> {SL[dmUser.status] || "Offline"}</div>
                            </div>
                          </div>
                          <div className="dm-msgs">
                            {dmMsgsLoading && (
                              <div className="empty" style={{padding:"40px 20px"}}>
                                <div className="empty-sub">Loading messages...</div>
                              </div>
                            )}
                            {!dmMsgsLoading && dmRealMessages.length === 0 && (
                              <div className="empty" style={{padding:"40px 20px"}}>
                                <div className="empty-ico">💬</div>
                                <div className="empty-title">Start talking</div>
                                <div className="empty-sub">Say hello to {dmUser.name}!</div>
                              </div>
                            )}
                            {dmRealMessages.map(m => (
                              <div key={m.id} className={`dm-bubble ${m.sender_id === user?.id ? "mine" : "theirs"}`} style={{opacity: m._optimistic ? 0.7 : 1}}>
                                <div>{m.content}</div>
                                <div className="dm-bubble-time">
                                  {new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}
                                  {m.edited_at && " (edited)"}
                                </div>
                              </div>
                            ))}
                            <div ref={msgsEnd} />
                          </div>
                          {dmSendError && (
                            <div style={{padding:"4px 16px",fontSize:11,color:"#F87171"}}>{dmSendError}</div>
                          )}
                          <div className="dm-composer">
                            <div className="dm-cmp-inner">
                              <textarea className="cmp-ta" rows={1} placeholder={`Message ${dmUser.name}...`}
                                value={dmMsg} onChange={e => setDmMsg(e.target.value)}
                                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
                                disabled={dmSending}
                              />
                              <button className="cmp-send" onClick={sendDM} disabled={dmSending}>{dmSending ? "..." : "→"}</button>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* ── PROFILE ── */}
              {view === "profile" && user && (
                <div className="profile-page">
                  <button className="back-btn" style={{marginBottom:20}} onClick={() => setView("home")}>← Back</button>
                  <div className="profile-card">
                    <div className="profile-top">
                      <div className="av av-xl" style={{background:"linear-gradient(135deg,#E8845A,#C4624A)"}}>
                        {user.initials}
                        <span className="pip pip-lg" style={{background:SC[S.ONLINE]}}></span>
                      </div>
                      <div className="profile-info">
                        <div className="profile-name">{user.name}{isVerified && <span className="verified-badge-lg" title="Verified">⭐</span>}</div>
                        <div className="profile-handle">{user.handle}</div>
                        <div className="profile-chips">
                          <span className="badge badge-pub">● Online</span>
                          <span style={{padding:"2px 9px",background:"rgba(232,132,90,0.1)",border:"1px solid rgba(232,132,90,0.2)",borderRadius:"var(--r99)",fontSize:10,fontWeight:700,color:"var(--clay)"}}>
                            {profileSettings.profilePublic ? "🌐 Public" : "🔒 Private"}
                          </span>
                        </div>
                        <div className="profile-bio">Member of Orbit Thread — focused intellectual discourse. Think louder, together.</div>
                      </div>
                    </div>
                    <div className="prof-sec">Interests</div>
                    <div className="tag-row">
                      {selectedTopics.length === 0 ? <span style={{fontSize:12,color:"var(--t2)",fontStyle:"italic"}}>No topics yet.</span> : selectedTopics.map(t=><span key={t} className="tag-item">{t}</span>)}
                    </div>
                    <div className="prof-sec">My Rooms</div>
                    {rooms.length === 0 ? <div style={{fontSize:13,color:"var(--t2)",fontStyle:"italic"}}>No rooms created yet.</div> : rooms.map(r=><div key={r.id} className="room-list-row" onClick={()=>enterRoom(r)}>{r.name}</div>)}
                    <div className="prof-actions">
                      {!isVerified && (
                        <button className="btn-primary" onClick={() => setShowPremium(true)}>⭐ Upgrade to Premium</button>
                      )}
                      <button className="btn-ghost" onClick={() => setShowSettings(true)}>⚙ Settings</button>
                      <button className="btn-danger" onClick={signOut}>Sign Out</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ CREATE ROOM MODAL ══ */}
        {showCreate && (
          <div className="overlay" onClick={() => setShowCreate(false)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-head"><h3>Create a Room</h3><button className="modal-x" onClick={() => setShowCreate(false)}>✕</button></div>
              <div className="field"><div className="fl">Room Name</div><input className="fi" placeholder="e.g., Climate Tech Deep Dive" value={createForm.name} onChange={e=>setCreateForm({...createForm,name:e.target.value})} /></div>
              <div className="field"><div className="fl">Purpose</div><textarea className="fi fi-ta" placeholder="What will this room focus on?" value={createForm.purpose} onChange={e=>setCreateForm({...createForm,purpose:e.target.value})} /></div>
              <div className="field">
                <div className="fl">Visibility</div>
                <div className="vis-grid">
                  <div className={`vis-opt${createForm.visibility==="public"?" sel":""}`} onClick={()=>setCreateForm({...createForm,visibility:"public"})}>
                    <div className="vis-ico">🌐</div><div className="vis-name">Public</div><div className="vis-sub">Anyone on Orbit Thread can read & join.</div>
                  </div>
                  <div className={`vis-opt${createForm.visibility==="private"?" sel":""}`} onClick={()=>setCreateForm({...createForm,visibility:"private"})}>
                    <div className="vis-ico">🔒</div><div className="vis-name">Private</div><div className="vis-sub">Invite-only. You approve members.</div>
                  </div>
                </div>
              </div>
              {createForm.visibility==="public" && (
                <>
                  <div className="field">
                    <div className="fl">Member Limit</div>
                    <div className="chip-row">
                      {["20","40","50","100","Custom"].map(l => <div key={l} className={`chip${createForm.limit===l?" sel":""}`} onClick={()=>setCreateForm({...createForm,limit:l})}>{l==="Custom"?"Custom (max 1,000)":l}</div>)}
                    </div>
                    {createForm.limit==="Custom" && <input className="fi" type="number" style={{marginTop:8,width:170}} min={1} max={1000} placeholder="Max 1,000" value={createForm.customLimit} onChange={e=>setCreateForm({...createForm,customLimit:String(Math.min(1000,Math.max(1,parseInt(e.target.value)||1)))})} />}
                  </div>
                  {/* Phase 2: Geo-radius selector for public rooms */}
                  <div className="field">
                    <div className="fl">Broadcast Radius 📡</div>
                    <div style={{fontSize:11,color:"var(--t2)",marginBottom:8}}>How far should your room be discoverable?</div>
                    <div className="radius-grid">
                      {RADIUS_OPTIONS.map(o => (
                        <div key={o.value} className={`radius-opt${createForm.radius===o.value?" sel":""}`}
                          onClick={() => setCreateForm({...createForm, radius:o.value})}>
                          {o.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {createForm.visibility==="private" && (
                <div className="field">
                  <div className="fl">Schedule Session (Optional)</div>
                  <div className="dt-row">
                    <input className="fi" type="date" value={createForm.date} onChange={e=>setCreateForm({...createForm,date:e.target.value})} />
                    <input className="fi" type="time" value={createForm.time} onChange={e=>setCreateForm({...createForm,time:e.target.value})} />
                  </div>
                  {createForm.date && createForm.time && (
                    <div className="cal-row">
                      <button className="btn-ghost" style={{fontSize:12}} onClick={()=>openGCal({name:createForm.name||"Orbit Thread Session",desc:createForm.purpose,schedule:{date:createForm.date,time:createForm.time}})}>📅 Google Calendar</button>
                      <button className="btn-ghost" style={{fontSize:12}} onClick={()=>downloadICS({name:createForm.name||"Orbit Thread Session",desc:createForm.purpose,schedule:{date:createForm.date,time:createForm.time}})}>⬇ Download .ics</button>
                    </div>
                  )}
                </div>
              )}
              <div className="modal-foot">
                <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
                <button className="btn-primary" disabled={!createForm.name.trim()} onClick={createRoom}>{createForm.visibility==="private"?"Create & Invite →":"Create Room"}</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ INVITE MODAL ══ */}
        {showInvite && (
          <div className="overlay" onClick={() => setShowInvite(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()}>
              <div className="modal-head"><h3>Invite to "{activeRoom?.name}"</h3><button className="modal-x" onClick={() => setShowInvite(false)}>✕</button></div>
              <div className="field"><div className="fl">Email or Orbit Thread Handle</div><input className="fi" placeholder="@handle or email@example.com" /></div>
              <div style={{fontSize:11,color:"var(--t2)",marginBottom:10,fontStyle:"italic"}}>Or pick from your connections:</div>
              <div className="invite-list">
                {DEMO_USERS.map(u => (
                  <div key={u.id} className="inv-row">
                    <div className="av av-sm" style={{background:avatarGrad(u.hue)}}>{u.initials}<span className="pip pip-sm" style={{background:SC[u.status]}}></span></div>
                    <div className="inv-name">{u.name} <span style={{fontSize:11,color:"var(--t2)"}}>{u.handle}</span></div>
                    {connStates[u.id]===CS.ACCEPTED ? (
                      <button className="btn-ghost" style={{fontSize:12,padding:"5px 12px"}} onClick={()=>{addNotif(`Invite sent to <strong>${u.name}</strong> for <strong>${activeRoom?.name}</strong>.`);}}>Invite</button>
                    ) : <span style={{fontSize:11,color:"var(--t2)",fontStyle:"italic"}}>Not connected</span>}
                  </div>
                ))}
              </div>
              <div style={{fontSize:11,color:"var(--t2)",padding:"10px 0",borderTop:"1px solid var(--b0)",fontStyle:"italic"}}>⚡ Only connected people can be invited to private rooms. Members must be approved before posting.</div>
              <div className="modal-foot"><button className="btn-primary" onClick={() => setShowInvite(false)}>Done</button></div>
            </div>
          </div>
        )}

        {/* ══ SETTINGS MODAL ══ */}
        {showSettings && (
          <div className="overlay" onClick={() => setShowSettings(false)}>
            <div className="modal" onClick={e=>e.stopPropagation()} style={{maxHeight:"85vh",overflowY:"auto"}}>
              <div className="modal-head"><h3>Settings</h3><button className="modal-x" onClick={() => setShowSettings(false)}>✕</button></div>
              <div className="s-section">
                <div className="s-label">Profile</div>
                <div className="field"><div className="fl">Display Name</div><input className="fi" placeholder="Your name" defaultValue={user?.name} /></div>
                <div className="field"><div className="fl">Bio</div><textarea className="fi fi-ta" style={{minHeight:60}} placeholder="What are you about?" /></div>
              </div>

              {/* ── CHANGE PASSWORD ── */}
              <div className="s-section">
                <div className="s-label">Change Password</div>
                <div className="pw-fields">
                  <div className="pw-field">
                    <label>Current Password</label>
                    <input className="pw-input" type="password" placeholder="Enter current password" value={pwCurrent} onChange={e=>setPwCurrent(e.target.value)} />
                  </div>
                  <div className="pw-field">
                    <label>New Password</label>
                    <input className="pw-input" type="password" placeholder="Min. 6 characters" value={pwNew} onChange={e=>setPwNew(e.target.value)} />
                  </div>
                  <div className="pw-field">
                    <label>Confirm New Password</label>
                    <input className="pw-input" type="password" placeholder="Re-enter new password" value={pwConfirm} onChange={e=>setPwConfirm(e.target.value)} />
                  </div>
                  <button className="btn-ghost" style={{alignSelf:"flex-start",marginTop:4}} onClick={handleChangePassword}>Update Password</button>
                  {pwMsg && <div className={`pw-msg ${pwMsg.type}`}>{pwMsg.text}</div>}
                </div>
              </div>

              <div className="s-section">
                <div className="s-label">Privacy</div>
                {[{k:"profilePublic",l:"Public Profile",s:"Anyone can view your profile"},{k:"showStatus",l:"Show Online Status",s:"Others see your live status dot"},{k:"allowConnect",l:"Allow Connections",s:"Anyone can send you a request"}].map(i=>(
                  <div key={i.k} className="tog-row">
                    <div><div className="tog-label">{i.l}</div><div className="tog-sub">{i.s}</div></div>
                    <button className={`toggle${profileSettings[i.k]?" on":""}`} onClick={()=>setProfileSettings(p=>({...p,[i.k]:!p[i.k]}))} />
                  </div>
                ))}
              </div>
              <div className="s-section">
                <div className="s-label">Notifications</div>
                <div className="tog-row"><div><div className="tog-label">Email Notifications</div><div className="tog-sub">Invites, replies, connections</div></div><button className={`toggle${profileSettings.emailNotifs?" on":""}`} onClick={()=>setProfileSettings(p=>({...p,emailNotifs:!p.emailNotifs}))} /></div>
              </div>

              {/* ── VERIFIED BADGE ── */}
              <div className="s-section">
                <div className="s-label">Subscription</div>
                <div className="vb-card">
                  <div className="vb-top">
                    <div className="vb-icon">◆</div>
                    <div>
                      <div className="vb-title">Orbit Thread Verified</div>
                      <div className="vb-price">{isVerified ? "Your plan is active" : "Unlock the full Orbit Thread experience"}</div>
                    </div>
                  </div>
                  <div className="vb-perks">
                    <div className="vb-perk">Verified checkmark on your profile</div>
                    <div className="vb-perk">Unlimited Circles (rooms) per day</div>
                    <div className="vb-perk">Priority support & early features</div>
                    <div className="vb-perk">Stand out in People discovery</div>
                  </div>
                  {isVerified ? (
                    <>
                      <div className="vb-owned">✓ Verified — Active</div>
                      <div className="vb-managed">
                        <div className="vb-managed-plan">Plan: <strong>{subPlan === "yearly" ? "Annual ($30/yr)" : "Monthly ($4/mo)"}</strong></div>
                        <button className="vb-cancel" onClick={() => {
                          if (window.confirm("Cancel your Verified subscription?\nYou'll lose your badge and unlimited Circles at the end of this billing period.")) {
                            setIsVerified(false);
                            addNotif("Your Verified subscription has been cancelled.");
                          }
                        }}>Cancel Plan</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="vb-plans">
                        <div className={`vb-plan${subPlan==="monthly"?" sel":""}`} onClick={()=>setSubPlan("monthly")}>
                          <div className="vb-plan-name">Monthly</div>
                          <div className="vb-plan-price">$4</div>
                          <div className="vb-plan-cycle">per month</div>
                        </div>
                        <div className={`vb-plan${subPlan==="yearly"?" sel":""}`} onClick={()=>setSubPlan("yearly")}>
                          <div className="vb-plan-save">Save 37%</div>
                          <div className="vb-plan-name">Annual</div>
                          <div className="vb-plan-price">$30</div>
                          <div className="vb-plan-cycle">per year · $2.50/mo</div>
                        </div>
                      </div>
                      <button className="vb-buy" onClick={handleBuyBadge}>
                        {subPlan === "yearly" ? "Subscribe — $30/year" : "Subscribe — $4/month"}
                      </button>
                    </>
                  )}
                  {!isVerified && (
                    <div style={{fontSize:11,color:"var(--t2)",marginTop:8,textAlign:"center"}}>
                      Free: {getRoomsRemaining() === Infinity ? "∞" : getRoomsRemaining()} of {DAILY_LIMIT} Circles remaining today
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-foot"><button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button><button className="btn-primary" onClick={saveSettings}>Save</button></div>
            </div>
          </div>
        )}

        {/* ══ PREMIUM MODAL ══ */}
        {showPremium && (
          <div className="overlay" onClick={() => setShowPremium(false)}>
            <div className="modal premium-modal" onClick={e => e.stopPropagation()}>
              <div className="pm-star">⭐</div>
              <div className="pm-title">Orbit Thread Premium</div>
              <div className="pm-price">$4.99 <span>/ month</span></div>
              <div className="pm-features">
                <div className="pm-feat"><span className="pm-feat-ico">⭐</span> Verified badge on your profile and rooms</div>
                <div className="pm-feat"><span className="pm-feat-ico">🚀</span> Unlimited room creation (free = 5/day)</div>
                <div className="pm-feat"><span className="pm-feat-ico">📡</span> Worldwide radius on all public rooms</div>
                <div className="pm-feat"><span className="pm-feat-ico">📎</span> Image uploads in chat</div>
                <div className="pm-feat"><span className="pm-feat-ico">🎯</span> Priority in discovery feed</div>
              </div>
              <div className="pm-actions">
                <button className="pm-start" onClick={handleStartPremium}>Start Free Trial</button>
                <button className="pm-cancel" onClick={() => setShowPremium(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* ══ CALL MODAL ══ */}
        {showCall && (
          <div className="call-overlay" onClick={() => setShowCall(null)}>
            <div className="call-modal" onClick={e=>e.stopPropagation()}>
              <div className="call-av" style={{background:"linear-gradient(135deg,#E8845A,#C4624A)"}}>{showCall.room?.name?.[0]||"V"}</div>
              <div className="call-type-lbl">{showCall.type==="video"?"Video Call":"Voice Call"}</div>
              <div className="call-name">{showCall.room?.name}</div>
              <div className="call-status">{showCall.type==="voice"?"🔊 Connecting audio...":"📹 Starting camera..."}</div>
              <div className="call-note">Phase 2: Real WebRTC via Daily.co</div>
              <div className="call-ctrls">
                <button className="call-ctrl ctrl-mute">🎤</button>
                {showCall.type==="video"&&<button className="call-ctrl ctrl-mute">📷</button>}
                <button className="call-ctrl ctrl-end" onClick={() => setShowCall(null)}>📵</button>
              </div>
            </div>
          </div>
        )}

        {profWarn && (
          <div className="warn-toast">🚫 Message blocked — Orbit Thread requires clean, respectful language.</div>
        )}

        {successToast && (
          <div className="success-toast">{successToast}</div>
        )}
      </div>
    </>
  );
}

function MagIco({ className }) {
  return <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
}
function Goog() {
  return <svg width="17" height="17" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>;
}