// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// イベント案内の管理ツール（docs/03_spec.md にそって実装）
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md「0. 画面の型」のとおりに設定
//  ⚠ 新しいCSSは書かない。用意された選択肢から選ぶだけ。
// ═══════════════════════════════════════════════════════════

/** 色み。事業会社の新事業開発部（BtoB）なので indigo */
const TONE = "indigo";

/** 密度。1日10件なので normal */
const DENSITY = "normal";

/** 画面の型。開催日という動かせない期限が判断の軸なので due */
const LAYOUT: "queue" | "stage" | "due" = "due";

/** 数え方。セミナー・講演は「本」で数える */
const UNIT = "本";

/** 区分の選択肢＝開催場所。行ける場所かどうかが判断に効く */
const CATEGORIES = ["オンライン", "都内会場", "都外会場"];

// ═══════════════════════════════════════════════════════════

/** イベント案内 1本ぶん。データ項目は5つ（＋状態） */
type Record = {
  id: string;
  name: string;       // イベント名
  category: string;   // 開催場所
  fee: string;        // 参加費
  organizer: string;  // 主催者名
  date: string;       // 開催日（YYYY-MM-DD）
  done: boolean;      // 申込済か
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "event-invite-data";
const NAME_KEY = "event-invite-appname";

/** 画面じゅうの言葉。ここを直せば文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "未対応のものが、待たせている順に並びます",
    open: "未対応", done: "対応済",
    toTo: "対応済みにする", toBack: "未対応に戻す",
    dateLabel: "受けた日", catLabel: "区分",
    stat2: "3日以上 放置",
    headOpen: "未対応（待たせている順）",
  },
  stage: {
    sub: "どの段階で止まっているかが分かります",
    open: "進行中", done: "完了",
    toTo: "完了にする", toBack: "進行中に戻す",
    dateLabel: "受け入れた日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "進行中",
  },
  due: {
    sub: "開催日が近い順に並びます",
    open: "検討中", done: "申込済",
    toTo: "申込済にする", toBack: "検討中に戻す",
    dateLabel: "開催日", catLabel: "開催場所",
    stat2: "開催が過ぎた",
    headOpen: "検討中（開催日が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後 */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日待たせているか（"queue" / "stage" 用） */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。実在の人名・会社名・連絡先は使わない（主催者名はすべて架空）
 * 検討中 9本 / 申込済 5本
 */
const SAMPLE: Record[] = [
  { id: "s01", name: "新規事業の立ち上げ実務セミナー",        category: "オンライン", fee: "無料",     organizer: "みらい事業創造フォーラム",   date: ago(3),   done: false },
  { id: "s02", name: "大企業の社内起業 失敗事例に学ぶ",        category: "オンライン", fee: "3,300円",  organizer: "ビジネスデザイン協議会",     date: ago(1),   done: false },
  { id: "s03", name: "事業共創ピッチ 秋の回",                  category: "都内会場",   fee: "5,500円",  organizer: "共創ラボ東京",               date: ago(0),   done: false },
  { id: "s04", name: "新規事業の値決めワークショップ",         category: "都内会場",   fee: "11,000円", organizer: "事業開発カレッジ",           date: ago(-1),  done: false },
  { id: "s05", name: "BtoB SaaS の初期顧客のつくり方",         category: "オンライン", fee: "無料",     organizer: "みらい事業創造フォーラム",   date: ago(-3),  done: false },
  { id: "s06", name: "地域産業とのオープンイノベーション商談会", category: "都外会場",  fee: "無料",     organizer: "北陸ものづくり交流会",       date: ago(-5),  done: false },
  { id: "s07", name: "新規事業担当者の夜会（第12回）",         category: "都内会場",   fee: "2,000円",  organizer: "事業開発ナイト運営委員会",   date: ago(-7),  done: false },
  { id: "s08", name: "生成AI活用の社内実装 事例報告会",        category: "オンライン", fee: "無料",     organizer: "デジタル推進研究フォーラム", date: ago(-12), done: false },
  { id: "s09", name: "新規事業 撤退基準のつくり方",            category: "オンライン", fee: "4,400円",  organizer: "ビジネスデザイン協議会",     date: ago(-18), done: false },
  { id: "s10", name: "顧客インタビュー実践講座",               category: "都内会場",   fee: "8,800円",  organizer: "事業開発カレッジ",           date: ago(-2),  done: true  },
  { id: "s11", name: "大手×スタートアップ 提携実務セミナー",   category: "都内会場",   fee: "無料",     organizer: "共創ラボ東京",               date: ago(-6),  done: true  },
  { id: "s12", name: "新規事業の予算取り 社内説得の型",        category: "オンライン", fee: "6,600円",  organizer: "事業開発カレッジ",           date: ago(-9),  done: true  },
  { id: "s13", name: "関西 事業創造カンファレンス",            category: "都外会場",   fee: "15,000円", organizer: "関西イノベーション協議会",   date: ago(-14), done: true  },
  { id: "s14", name: "新規事業部門の組織づくり座談会",         category: "オンライン", fee: "無料",     organizer: "みらい事業創造フォーラム",   date: ago(-21), done: true  },
];

/** 一覧をどう束ねるか。LAYOUT ごとに変わる */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Record[] };

function grouped(list: Record[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.category === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "開催が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.date);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す小さなバッジ。開催日までの残りを見せる */
function rowBadge(r: Record): { text: string; kind: "" | "warn" | "danger" } | null {
  if (r.done) return null;
  if (LAYOUT === "due") {
    const d = diff(r.date);
    if (d < 0) return { text: `${-d}日前に終了`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    if (d === 1) return { text: "明日", kind: "warn" };
    if (d <= 7) return { text: `あと${d}日`, kind: "" };
    return null;
  }
  const w = waiting(r.date);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Record[]>([]);
  const [appName, setAppName] = useState("イベント案内の管理");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record | null>(null);

  const [form, setForm] = useState({
    name: "", category: CATEGORIES[0], fee: "", organizer: "", date: today(),
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Record[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1本でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計。検討中のまま開催日が過ぎたもの */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.done);
    if (LAYOUT === "due") return open.filter((i) => diff(i.date) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.date) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => !k || (i.name + i.organizer + i.category + i.fee).toLowerCase().includes(k))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ name: "", category: CATEGORIES[0], fee: "", organizer: "", date: today() });
    setEditing(null);
  }

  function save() {
    const name = form.name.trim();
    if (!name) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, name } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, name, done: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Record) {
    setEditing(r);
    setForm({ name: r.name, category: r.category, fee: r.fee, organizer: r.organizer, date: r.date });
    setView("new");
  }

  const toggle = (id: string) => setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、開催日の位置に並びます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">届いた案内は、読んだその場で登録します</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全{UNIT}数</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="イベント名・主催者名で検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">{q ? "見つかりませんでした" : "登録した案内がまだありません"}</div>
                      <div className="d">
                        {q ? "イベント名か主催者名の一部で探し直してみてください。"
                           : "届いた案内メールを見ながら、右上の「新規登録」から1本ずつ追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.name}</div>
                              {(r.organizer || r.fee) && (
                                <div className="row-sub">
                                  {[r.organizer, r.fee].filter(Boolean).join(" ・ ")}
                                </div>
                              )}
                            </div>
                            <div className="row-meta">
                              {b && <span className={b.kind ? `badge badge-${b.kind}` : "badge"}>{b.text}</span>}
                              <span className="badge">{r.category}</span>
                              <span className="row-time">{r.date.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.done ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-name">イベント名<span className="req">必須</span></label>
                <input id="f-name" className="field" value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：新規事業の立ち上げ実務セミナー" />
                <span className="hint">案内メールの件名をそのまま貼っても構いません</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-date">{TEXT.dateLabel}</label>
                    <input id="f-date" className="field" type="date" value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-fee">参加費</label>
                    <input id="f-fee" className="field" value={form.fee}
                      onChange={(e) => setForm({ ...form, fee: e.target.value })}
                      placeholder="例：無料 / 5,500円" />
                  </div>
                  <div>
                    <label className="label" htmlFor="f-org">主催者名</label>
                    <input id="f-org" className="field" value={form.organizer}
                      onChange={(e) => setForm({ ...form, organizer: e.target.value })}
                      placeholder="例：みらい事業創造フォーラム" />
                  </div>
                </div>
                <span className="hint">分からなければ空のままで登録できます</span>
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.name.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この1{UNIT}を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
