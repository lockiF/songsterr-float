// ==UserScript==
// @name         Songsterr Float
// @namespace    https://github.com/fixsongsterr
// @version      4.0.0
// @description  Desktop layout for Songsterr: top pill navigation, centered panels, popups under the pills
// @match        https://www.songsterr.com/*
// @match        https://songsterr.com/*
// @run-at       document-start
// @grant        GM_addStyle
// @grant        GM.addStyle
// ==/UserScript==

/*
 * Структура файла:
 *   1. КОНФИГ        — все числа и имена классов сайта в одном месте
 *   2. СТИЛИ         — CSS собирается из функций; каждое свойство задано ОДИН раз
 *   3. УТИЛИТЫ
 *   4. ФУНКЦИИ       — dock, topBar, logo, videoStack, enterAnimations, scrollGuard, popups
 *   5. ЗАПУСК        — один MutationObserver, который вызывает функции по порядку
 *
 * Если сайт обновился и что-то отвалилось — почти всегда это хэшированные
 * классы: правятся только в объекте C.
 */
(function () {
  "use strict";

  /* ==========================================================
     1. КОНФИГ
     ========================================================== */

  // Геометрия (px). Из этих чисел генерируются и CSS-переменные, и JS-расчёты.
  const G = {
    pillBg: "#252529",
    pillShadow: "0 4px 16px rgba(0, 0, 0, 0.4)",
    pillHeight: 56,
    pillOffset: 12,
    panelGap: 12,
    barWidth: 1000,
    sideWidth: 380,        // ширина правой колонки (микшер, настройки, видео)
    btnSize: 48,
    dockInset: 6,          // отступ дока со всех сторон
    dockBottom: 12,
    dockGap: 10,
    dockRadius: 22,
    btnGap: 10,            // зазор между кнопками внутри группы
    rowGap: 8,
    editColGap: 8,
    sepSpace: 14,          // воздух вокруг разделителя групп
    sepHeight: 30,
    wideMin: 1811,         // от этой ширины справа есть место под видео-панель
    logoHeight: 43,
    diffShift: 22,         // сдвиг страницы сравнения ревизий
    helpMenuBottom: -165,
    profilePopupBottom: -101,
    animMs: 180,
  };
  const CONTENT_TOP = G.pillOffset + G.pillHeight + G.panelGap;

  const Z = { dock: 900, video: 940, popupWindow: 950, tabs: 1000, panels: 1001, popup: 1100 };

  // Хэшированные классы сайта (CSS-modules). Менять только здесь.
  const C = {
    barCenter: "_0meAjW_bottomBarCenter",
    barRight: "_0meAjW_bottomBarRight",
    profile: "_0meAjW_profile",
    itemWrapper: "_0meAjW_itemWrapper",
    helpMenu: "_0meAjW_helpMenu",
    navItem: "_0meAjW_item",
    navText: "_0meAjW_text",
    toolsRow: "_5pcfpW_controlsTopPanelRow",
    dockBar: "idrtTa_controls",
    dockCard: "idrtTa_controlsCard",
    dockItem: "idrtTa_item",
    dockSettings: "idrtTa_settings",
    video: "oCvYpa_panel",
    revisionDate: "_8e144G_date",
    fancyBox: "_6_NcWG_container",
    fancyChecked: "_6_NcWG_labelChecked",
    logo: "_9HBv-q_logoContainer",
  };

  // Селекторы, собранные из классов
  const S = {
    tabs: "#tablist",
    nav: `#tablist > .${C.barCenter}:nth-child(1)`,
    mid: `#tablist > .${C.barCenter}:nth-child(2)`,
    right: `#tablist > .${C.barRight}`,
    dock: "#controls",
    bar: `#controls .${C.dockBar}`,
    tools: `.${C.toolsRow}`,
    video: `.${C.video}`,
    popup: "[data-fixpopup]",
    revisions: '[data-fixpopup="revisions"]',
    inbox: "#inbox-popup",
    help: "#help-menu",
    profilePopup: "#profile-popup-desktop",
    panels: "#panel-search, #panel-favorites, #panel-newtab",
  };

  // Кнопки основного дока: группы слева направо. Между группами — разделитель.
  const MAIN_GROUPS = [
    ["c-play", "c-loop", "c-speed", "c-countin", "c-metronome"],
    ["mixer-button", "c-solo", "c-mute"],
    ["c-transpose", "c-detectchords"],
    ["c-export", "c-print", "c-revision", "c-settings"],
  ];
  const KNOWN_IDS = new Set(MAIN_GROUPS.flat());
  const btnOrder = (group, i) => group * 10 + i + 1;
  const sepOrder = (group) => group * 10;

  /* Режим редактирования таба. Кнопки, которых нет в MAIN_GROUPS, считаются
     кнопками редактирования; числа — их номера в порядке DOM (с нуля).
     Массив задаёт группы и порядок. Кнопка 4 (сброс) вынесена в конец. */
  const EDIT_LAYOUT = [[0, 1], [2, 3], [5, 6, 7], [8, 9, 10, 11], [4]];
  const EDIT_BASE = -1000;
  const EDIT_MIN = 8; // меньше «лишних» кнопок — это не режим редактирования

  // Окна дока, которые находим по тексту заголовка
  const POPUP_TITLES = new Set([
    "Mixer", "Микшер",
    "Transpose", "Transpose notation", "Транспонирование",
    "Settings", "Настройки",
    "Revisions", "Ревизии",
  ]);
  const REVISION_TITLES = new Set(["Revisions", "Ревизии"]);
  const POPUP_TITLE_RE = /^(metronome|метроном|count[\s-]?in|speed|скорост|loop|зацикл)/i;

  // Параметры детекции окон и подъёма видео-панели
  const POPUP = {
    titleMinW: 250, titleMaxW: 520,   // ширина окна, найденного по заголовку
    maxW: 560, minW: 100, minH: 40,   // окна, влияющие на видео-панель
    blockTolerance: 24,               // запас до переноса панели влево
    maxCandidatesPerBatch: 60,
    maxDepth: 2,
    maxChildren: 40,
  };

  /* ==========================================================
     2. СТИЛИ
     ========================================================== */

  // rule: все декларации с !important (кроме important=false); camelCase → kebab-case
  const rule = (sel, decls, important = true) =>
    `${sel} {\n` +
    Object.entries(decls)
      .map(([k, v]) => {
        const prop = k.startsWith("--") ? k : k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase());
        return `  ${prop}: ${v}${important ? " !important" : ""};`;
      })
      .join("\n") +
    "\n}\n";

  const media = (query, ...rules) => `@media ${query} {\n${rules.join("\n")}}\n`;
  const WIDE = `(min-width: ${G.wideMin}px)`;
  const NARROW = `(max-width: ${G.wideMin - 1}px)`;

  const tokens = () => `:root {
  --pill-bg: ${G.pillBg};
  --pill-shadow: ${G.pillShadow};
  --pill-height: ${G.pillHeight}px;
  --pill-offset: ${G.pillOffset}px;
  --panel-gap: ${G.panelGap}px;
  --bar-width: ${G.barWidth}px;
  --left-width: ${G.sideWidth}px;
  --btn-size: ${G.btnSize}px;
  --dock-inset: ${G.dockInset}px;
  --dock-bottom: ${G.dockBottom}px;
  --dock-gap: ${G.dockGap}px;
  --dock-radius: ${G.dockRadius}px;
  --btn-gap: ${G.btnGap}px;
  --dock-row-gap: ${G.rowGap}px;
  --dock-col-gap: ${G.editColGap}px;
  --sep-space: ${G.sepSpace}px;
  --sep-height: ${G.sepHeight}px;
  --divider: rgba(255, 255, 255, 0.10);
  --diff-shift: ${G.diffShift}px;
  --fx-dur: ${G.animMs}ms;
  --help-menu-bottom: ${G.helpMenuBottom}px;
  --profile-popup-bottom: ${G.profilePopupBottom}px;

  /* производные */
  --dock-height: calc(var(--btn-size) + 2 * var(--dock-inset));
  --dock-width: min(var(--bar-width), calc(100vw - 2 * var(--pill-offset)));
  --btn-radius: calc(var(--dock-radius) - var(--dock-inset));
  --content-top: calc(var(--pill-offset) + var(--pill-height) + var(--panel-gap));
  --panel-bottom: calc(var(--dock-bottom) + var(--dock-height) + var(--panel-gap));
}
`;

  /* Верхняя плашка: одна, шириной как док. [вкладки | разделитель | inbox, help | профиль].
     Привязана к странице (absolute) и едет со скроллом, как логотип.
     Чтобы она «висела на месте» — position: fixed здесь и в контейнере. */
  const topBarCss = () => [
    rule("*:has(> #tablist)", {
      position: "absolute", top: 0, left: 0, right: "auto", bottom: "auto",
      width: "100%", minWidth: 0, maxWidth: "none", height: 0,
      margin: 0, padding: 0, transform: "none",
      background: "none", border: "none", boxShadow: "none", zIndex: Z.tabs,
    }),
    rule(S.tabs, {
      position: "absolute", top: "var(--pill-offset)", bottom: "auto",
      left: "50%", right: "auto", transform: "translateX(-50%)",
      width: "var(--dock-width)", height: "var(--pill-height)",
      margin: 0, padding: "0 16px",
      display: "flex", flexDirection: "row", direction: "ltr", // у сайта порядок зеркальный
      alignItems: "center", justifyContent: "flex-start", boxSizing: "border-box",
      background: "var(--pill-bg)", borderRadius: "var(--dock-radius)",
      boxShadow: "var(--pill-shadow)", zIndex: Z.tabs,
    }),
    // бывшая центральная пилюля — левая часть общей плашки
    rule(S.nav, {
      position: "static", top: "auto", bottom: "auto", left: "auto", right: "auto",
      transform: "none", order: -1, flex: "1 1 auto", width: "auto", maxWidth: "none",
      height: "100%", margin: 0, padding: 0,
      display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box",
      background: "none", boxShadow: "none", borderRadius: 0,
    }),
    rule(`${S.mid}, ${S.right}`, {
      position: "static", height: "auto", margin: 0, padding: 0,
      background: "transparent", border: "none", boxShadow: "none",
      display: "flex", alignItems: "center",
    }),
    rule(S.mid, { order: 1 }),
    rule(S.right, { order: 2 }),

    // иконки и текст
    rule(
      `${S.right} .${C.profile}, ${S.mid} > .${C.itemWrapper}, ${S.mid} > .${C.helpMenu}, ${S.nav} > .${C.itemWrapper}`,
      { display: "flex", alignItems: "center", justifyContent: "center", margin: 0, padding: "0 14px" }
    ),
    rule(
      `${S.right} .${C.profile}, ${S.mid} > .${C.itemWrapper}, ${S.mid} > .${C.helpMenu}`,
      { padding: "0 10px" }
    ),
    rule(`${S.tabs} a.${C.navItem}`, {
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      height: "100%", gap: "3px", textDecoration: "none",
    }),
    rule(`${S.tabs} .${C.navText}`, {
      display: "block", visibility: "visible", opacity: 1, whiteSpace: "nowrap",
    }),

    // разделители внутри плашки
    rule(`${S.tabs} .fx-sep`, {
      flex: "0 0 1px", width: "1px", height: "var(--sep-height)", margin: 0, padding: 0,
      border: 0, background: "var(--divider)", alignSelf: "center", pointerEvents: "none",
    }),
    rule(`${S.tabs} > .fx-sep`, { margin: "0 10px" }),
  ].join("\n");

  // Центральные панели (поиск, My tabs, New tab) и попапы верхней плашки
  const panelsCss = () => [
    rule(S.panels, {
      position: "fixed", top: "var(--content-top)", bottom: "var(--panel-bottom)",
      left: "50%", right: "auto", transform: "translateX(-50%)",
      width: "var(--bar-width)", maxWidth: "calc(100vw - 2 * var(--pill-offset))",
      height: "auto", maxHeight: "none", margin: 0,
      display: "flex", flexDirection: "column", boxSizing: "border-box", zIndex: Z.panels,
    }),
    rule("#header", { margin: "calc(var(--pill-offset) + var(--pill-height)) 0 0 0" }, false),

    // inbox — absolute внутри плашки (у неё transform, поэтому fixed считался бы от неё)
    rule(S.inbox, {
      position: "absolute", top: "calc(var(--pill-height) + var(--panel-gap))",
      right: 0, left: "auto", bottom: "auto",
      width: "var(--left-width)",
      maxHeight: "calc(100vh - var(--content-top) - var(--panel-bottom))",
      transform: "none", borderRadius: "var(--dock-radius)", zIndex: Z.popup,
    }),
    // help и профиль — на --panel-gap ниже, чтобы не налезали на плашку
    rule(S.help, { bottom: "calc(var(--help-menu-bottom) - var(--panel-gap))", zIndex: Z.popup }),
    rule(S.profilePopup, { bottom: "var(--profile-popup-bottom)", zIndex: Z.popup }),
  ].join("\n");

  /* Нижний док. Ритм: внутри группы --btn-gap, вокруг разделителя ещё --sep-space.
     Полный набор кнопок заполняет док, неполный (сравнение ревизий) — кучка по центру. */
  const dockCss = () => [
    rule("#controls-panel-handle", { display: "none" }),
    rule(S.dock, {
      position: "fixed", top: "auto", bottom: "var(--dock-bottom)",
      left: "calc(50% - var(--dock-width) / 2)", right: "auto", // без transform: иначе fixed-потомки считаются от дока
      width: "var(--dock-width)", maxWidth: "calc(100vw - 2 * var(--pill-offset))",
      height: "auto", maxHeight: "calc(100vh - var(--content-top) - var(--dock-bottom))",
      margin: 0, padding: 0, transform: "none", overflow: "visible",
      display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-end",
      gap: "var(--dock-gap)", background: "none", boxShadow: "none", border: "none",
      borderRadius: 0, boxSizing: "border-box", zIndex: Z.dock,
    }),
    rule(S.dock, { pointerEvents: "none" }, false),
    rule("#controls > *", { pointerEvents: "auto" }, false),

    rule(`#controls .${C.dockCard}`, {
      width: "100%", minWidth: 0, maxWidth: "100%", overflow: "visible", boxSizing: "border-box",
    }),
    rule(S.bar, {
      width: "100%", minWidth: 0, maxWidth: "100%", height: "auto",
      minHeight: "var(--dock-height)", maxHeight: "unset", margin: 0,
      padding: "var(--dock-inset)", transform: "none", overflow: "visible",
      display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center",
      columnGap: "var(--btn-gap)", rowGap: "var(--dock-row-gap)",
      background: "var(--pill-bg)", borderRadius: "var(--dock-radius)",
      boxShadow: "var(--pill-shadow)", boxSizing: "border-box",
    }),

    // порядок кнопок и ячейки
    ...MAIN_GROUPS.flatMap((ids, g) =>
      ids.map((id, i) => rule(`${S.bar} > #${id}`, { order: btnOrder(g, i) }))
    ),
    rule(`${S.bar} > .${C.dockItem}`, {
      position: "relative", flex: "0 0 var(--btn-size)",
      width: "var(--btn-size)", height: "var(--btn-size)", minWidth: 0,
      margin: 0, padding: 0,
      display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box",
    }),
    rule(`${S.bar} > .${C.dockItem} > button:not(.${C.dockSettings})`, {
      width: "100%", height: "100%", margin: 0,
    }),
    rule(`${S.bar} > #c-play`, {
      flex: "0 0 auto", width: "auto", height: "var(--btn-size)", alignItems: "center", gap: "6px",
    }),
    rule(`${S.bar} > .${C.dockItem}:not(#c-play) > button, ${S.bar} > #c-play > button:first-child`, {
      borderRadius: "var(--btn-radius)",
    }),

    // разделители групп (создаёт JS)
    rule(`${S.bar} > .fx-sep`, {
      flex: "0 0 1px", width: "1px", height: "var(--sep-height)",
      margin: "0 var(--sep-space)", padding: 0, border: 0,
      background: "var(--divider)", pointerEvents: "none",
    }),

    // режим редактирования: два ряда на всю ширину, между ними линия-перенос
    rule(`${S.bar}[data-fx-edit]`, {
      justifyContent: "space-between", columnGap: "var(--dock-col-gap)",
    }),
    rule(`${S.bar}[data-fx-edit] > .fx-sep`, { margin: 0 }),
    rule(`${S.bar}[data-fx-edit]::after`, {
      content: '""', order: 0, flex: "0 0 calc(100% - 24px)", height: "1px",
      margin: "0 12px", background: "var(--divider)",
    }),
  ].join("\n");

  // Левая нижняя плашка инструментов (Play, ORIG./SYNTH, loop, speed...)
  const toolsCss = () => [
    rule(S.tools, {
      position: "fixed", top: "auto", right: "auto",
      left: "var(--pill-offset)", bottom: "var(--dock-bottom)",
      width: "var(--left-width)", height: "var(--dock-height)",
      margin: 0, padding: 0, transform: "none", visibility: "visible", opacity: 1,
      display: "flex", boxSizing: "border-box", pointerEvents: "auto",
      background: "none", border: "none", boxShadow: "none", borderRadius: 0, zIndex: Z.dock,
    }),
    rule(`${S.tools} > :only-child, #controls ${S.tools} > :only-child`, {
      flex: "1 1 auto", width: "100%", height: "100%", minHeight: 0, margin: 0,
      padding: "var(--dock-inset)",
      display: "flex", flexWrap: "nowrap", alignItems: "center", justifyContent: "space-between",
      gap: "0 var(--dock-col-gap)", boxSizing: "border-box",
      background: "var(--pill-bg)", border: "none",
      borderRadius: "var(--dock-radius)", boxShadow: "var(--pill-shadow)",
    }),
    rule(`${S.tools} #c-play`, { margin: 0 }),
    rule(`${S.tools} > :only-child > button`, { borderRadius: "var(--btn-radius)" }),
    // на узких экранах правая колонка занята — плашка инструментов над доком
    media(NARROW, rule(S.tools, { bottom: "var(--panel-bottom)" })),
  ].join("\n");

  /* Видео-панель («оригинальное аудио»): справа над окнами микшера и т.д.
     --fx-stack (подъём) и --fx-video-h (высота) ставит videoStack ниже. */
  const videoCss = () => [
    rule(`*:has(> ${S.video})`, { width: "100%" }),
    rule(S.video, {
      width: "100%", margin: 0, padding: "15px",
      background: "var(--pill-bg)", borderRadius: "var(--dock-radius)",
      boxShadow: "var(--pill-shadow)", boxSizing: "border-box",
    }),
    media(
      WIDE,
      rule(S.video, {
        position: "fixed", top: "auto", left: "auto", right: "var(--pill-offset)",
        bottom: "calc(var(--dock-bottom) + var(--fx-stack, 0px))",
        width: "var(--left-width)",
        maxHeight: "calc(100vh - var(--content-top) - var(--dock-bottom))",
        overflow: "auto", pointerEvents: "auto", zIndex: Z.video,
        transition: "bottom 0.18s ease-out",
      }),
      // окна справа ниже на высоту видео-панели — вместе помещаются под плашкой
      rule(`body:has(${S.video}) ${S.popup}`, {
        maxHeight:
          "calc(100vh - var(--content-top) - var(--dock-bottom) - var(--fx-video-h, 0px) - var(--panel-gap))",
      }),
      // справа открыто высокое окно (ревизии) — панель уходит в левую колонку
      rule(`:root[data-fx-video="left"] ${S.video}`, {
        right: "auto", left: "var(--pill-offset)", bottom: "var(--dock-bottom)",
      }),
      rule(`:root[data-fx-video="left"] body:has(${S.tools}) ${S.video}`, {
        bottom: "var(--panel-bottom)",
      })
    ),
  ].join("\n");

  // Окна микшера, транспонирования, настроек, ревизий (помечает JS: data-fixpopup)
  const popupsCss = () => [
    rule(S.popup, {
      position: "fixed", top: "auto", left: "auto",
      right: "var(--pill-offset)", bottom: "var(--dock-bottom)",
      width: "var(--left-width)",
      maxHeight: "calc(100vh - var(--content-top) - var(--dock-bottom))",
      margin: 0, paddingBottom: 0, transform: "none",
      boxSizing: "border-box", borderRadius: "var(--dock-radius)", zIndex: Z.popupWindow,
    }),
    // ревизии — правая колонка во всю высоту
    rule(S.revisions, { top: "var(--content-top)", bottom: "var(--dock-bottom)", height: "auto" }),
    rule(`html body:has(${S.video}) ${S.revisions}`, {
      maxHeight: "calc(100vh - var(--content-top) - var(--dock-bottom))",
    }),
    // на широком экране плашка не доходит до правой колонки — окно до уровня её верха
    media(
      WIDE,
      rule(`${S.revisions}, html body:has(${S.video}) ${S.revisions}`, {
        top: "var(--pill-offset)", maxHeight: "calc(100vh - 2 * var(--pill-offset))",
      })
    ),
  ].join("\n");

  // Мелкие правки: логотип, баннер ревизий, декоративная линия, страница diff
  const miscCss = () => [
    // вид логотипа родной, меняется только top (центр совпадает с центром плашки);
    // точную поправку на странице сравнения добавляет logo.align()
    rule(`.${C.logo}`, {
      top: `calc(var(--pill-offset) + (var(--pill-height) - ${G.logoHeight}px) / 2)`,
    }),
    rule(`.${C.revisionDate}`, { top: "-6px" }, false),
    rule(`.${C.fancyBox}:before, .${C.fancyBox}:has(.${C.fancyChecked}:first-child):before`, {
      content: "unset", animation: "unset",
    }),
    // страница сравнения ревизий: заголовок не под плашкой (флаг ставит JS)
    rule("html[data-fx-diff] body", { paddingTop: "var(--diff-shift)" }),
  ].join("\n");

  /* Анимации появления. Родные у большинства окон заглушены transform: none !important,
     поэтому анимируем только opacity. Класс .fx-enter вешает JS и снимает по окончании. */
  const animationsCss = () => `@media (prefers-reduced-motion: no-preference) {
  @keyframes fx-pop-in { from { opacity: 0; } to { opacity: 1; } }
  .fx-enter { animation: fx-pop-in var(--fx-dur) ease-out backwards; }

  /* раскрытие дока в режиме редактирования; старт с 0.5, иначе кнопки на миг «пропадают» */
  @keyframes fx-expand { from { opacity: 0.5; } to { opacity: 1; } }
  .${C.dockBar}.fx-expand > * { animation: fx-expand var(--fx-dur) ease-out backwards; }
}
`;

  const css = [
    tokens(), topBarCss(), panelsCss(), dockCss(), toolsCss(),
    videoCss(), popupsCss(), miscCss(), animationsCss(),
  ].join("\n");

  function injectStyles(styles) {
    try {
      if (typeof GM_addStyle === "function") return GM_addStyle(styles);
      if (typeof GM !== "undefined" && GM.addStyle) return GM.addStyle(styles);
    } catch (e) {
      // падаем на обычный <style>
    }
    const el = document.createElement("style");
    el.textContent = styles;
    (document.head || document.documentElement).appendChild(el);
  }

  injectStyles(css);

  /* ==========================================================
     3. УТИЛИТЫ
     ========================================================== */

  const root = document.documentElement;

  // Вызов не чаще раза за кадр
  function rafOnce(fn) {
    let pending = false;
    return () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        fn();
      });
    };
  }

  // CSS-переменная на <html> с кэшем последнего значения
  const rootVars = new Map();
  function setRootVar(name, value) {
    if (rootVars.get(name) === value) return;
    rootVars.set(name, value);
    root.style.setProperty(name, value);
  }

  function makeSep() {
    const sep = document.createElement("div");
    sep.className = "fx-sep";
    return sep;
  }

  /* ==========================================================
     4. ФУНКЦИИ
     ========================================================== */

  /* ---------- 4.1 Анимации появления ---------- */

  const ENTER_SEL = `${S.inbox}, ${S.help}, ${S.profilePopup}, ${S.video}`;

  function playEnter(el) {
    if (el instanceof HTMLElement && !el.classList.contains("fx-enter")) el.classList.add("fx-enter");
  }

  function markEnter(node) {
    if (!(node instanceof HTMLElement)) return;
    if (node.matches(ENTER_SEL)) playEnter(node);
    node.querySelectorAll(ENTER_SEL).forEach(playEnter);
  }

  function cleanupAnimation(e) {
    if (!(e.target instanceof HTMLElement)) return;

    if (e.animationName === "fx-pop-in") {
      e.target.classList.remove("fx-enter");
    } else if (e.animationName === "fx-expand") {
      const bar = e.target.closest("." + C.dockBar);
      if (bar) bar.classList.remove("fx-expand");
    }
  }

  /* ---------- 4.2 Нижний док ----------
     Функция идемпотентная: каждый раз считает нужное состояние по текущему DOM.
     React переиспользует узлы между режимами, поэтому наш order нужно не только
     ставить, но и снимать с узлов, которые перестали быть кнопками редактирования. */

  const isSep = (el) => el.classList.contains("fx-sep");

  function planEditLayout(extras) {
    const groups = EDIT_LAYOUT.map((g) => g.filter((i) => i < extras.length)).filter((g) => g.length);

    // кнопки, не попавшие в раскладку, — отдельной группой перед последней
    const used = new Set(groups.flat());
    const leftovers = extras.map((_, i) => i).filter((i) => !used.has(i));
    if (leftovers.length) groups.splice(Math.max(groups.length - 1, 0), 0, leftovers);

    const order = new Map();
    const seps = [];
    let k = 0;

    groups.forEach((g, gi) => {
      if (gi > 0) seps.push(EDIT_BASE + k++);
      g.forEach((i) => order.set(extras[i], EDIT_BASE + k++));
    });

    return { order, seps };
  }

  function applyOrders(items, orderMap) {
    items.forEach((el) => {
      const want = orderMap.get(el);
      const have = el.getAttribute("data-fx-k");

      if (want === undefined) {
        if (have !== null) {
          el.style.removeProperty("order");
          el.removeAttribute("data-fx-k");
        }
      } else if (have !== String(want)) {
        el.style.setProperty("order", String(want), "important");
        el.setAttribute("data-fx-k", String(want));
      }
    });
  }

  // пересоздаём разделители, только если набор изменился
  function syncSeparators(bar, current, wanted) {
    if (current.map((el) => el.style.order).join("|") === wanted.join("|")) return;

    current.forEach((el) => el.remove());
    wanted.forEach((order) => {
      const sep = makeSep();
      sep.style.order = String(order);
      bar.appendChild(sep);
    });
  }

  function syncEditMode(bar, editing) {
    if (editing) {
      if (!bar.hasAttribute("data-fx-edit")) {
        bar.setAttribute("data-fx-edit", "1");
        bar.classList.add("fx-expand"); // при входе в режим — анимация раскрытия
      }
    } else {
      bar.removeAttribute("data-fx-edit");
      bar.classList.remove("fx-expand");
    }
  }

  function syncDockBar(bar) {
    const kids = Array.from(bar.children);
    const seps = kids.filter(isSep);
    const items = kids.filter((el) => !isSep(el));

    const rawExtras = items.filter(
      (el) => el.classList.contains(C.dockItem) && !KNOWN_IDS.has(el.id)
    );
    const extras = rawExtras.length >= EDIT_MIN ? rawExtras : [];
    const plan = extras.length ? planEditLayout(extras) : { order: new Map(), seps: [] };

    // разделитель ставим перед группой, если её первая кнопка есть в доке
    const present = new Set(items.map((el) => el.id));
    const wantSeps = MAIN_GROUPS.flatMap((ids, g) =>
      g > 0 && present.has(ids[0]) ? [sepOrder(g)] : []
    ).concat(plan.seps);

    applyOrders(items, plan.order);
    syncSeparators(bar, seps, wantSeps);
    syncEditMode(bar, extras.length > 0);
  }

  function syncDock() {
    document.querySelectorAll("." + C.dockBar).forEach(syncDockBar);
  }

  /* ---------- 4.3 Логотип ----------
     На странице сравнения ревизий родной контейнер стоит ниже, поэтому CSS-значения
     top мало: измеряем, где логотип стоит сейчас, и подправляем top так, чтобы его
     центр совпал с центром плашки. На обычных страницах поправка ~0. */

  let logoEl = null;

  const sameSize = (a, b) => {
    const ra = a.getBoundingClientRect();
    const rb = b.getBoundingClientRect();
    return Math.abs(ra.width - rb.width) < 4 && Math.abs(ra.height - rb.height) < 4;
  };

  // ищем по виду: блок ~212x43 у левого края, затем поднимаемся к внешней обёртке того же размера
  function findLogo() {
    const cands = document.querySelectorAll(`.${C.logo}, [class*="logo" i], a[href="/"]`);

    for (const c of cands) {
      if (c.closest("#tablist, #controls, #help-menu, #profile-popup-desktop")) continue;

      const r = c.getBoundingClientRect();
      if (r.left > 40 || r.width < 120 || r.width > 320 || r.height < 30 || r.height > 70) continue;
      if (r.top + window.scrollY > 400) continue;

      let el = c;
      while (el.parentElement && el.parentElement !== document.body && sameSize(el, el.parentElement)) {
        el = el.parentElement;
      }
      return el;
    }
    return null;
  }

  function alignLogo() {
    if (!logoEl || !logoEl.isConnected) logoEl = findLogo();
    const el = logoEl;
    if (!el) return;

    let cs = getComputedStyle(el);

    // обычный блок — делаем relative, чтобы работал top
    if (cs.position === "static") {
      el.style.setProperty("position", "relative", "important");
      cs = getComputedStyle(el);
    }

    const curTop = parseFloat(cs.top) || 0;
    const target = G.pillOffset + (G.pillHeight - G.logoHeight) / 2;

    const r = el.getBoundingClientRect();
    const docTop = cs.position === "fixed" ? r.top : r.top + window.scrollY;
    const delta = target - docTop;

    if (Math.abs(delta) < 0.5) return;
    el.style.setProperty("top", curTop + delta + "px", "important");
  }

  const scheduleLogo = rafOnce(alignLogo);
  window.addEventListener("resize", scheduleLogo);
  window.addEventListener("load", scheduleLogo);

  /* ---------- 4.4 Верхняя плашка и флаги страницы ---------- */

  // Страница сравнения ревизий: адрес вида .../r9196866...r9465942
  function syncPageFlag() {
    const isDiff = /\/r\d+\D+r\d+/.test(location.pathname);
    const has = root.hasAttribute("data-fx-diff");

    if (isDiff && !has) root.setAttribute("data-fx-diff", "1");
    else if (!isDiff && has) root.removeAttribute("data-fx-diff");
  }

  function syncTopBar() {
    syncPageFlag();
    scheduleLogo();

    // разделитель между вкладками и правой группой (inbox / help / профиль)
    const tabs = document.getElementById("tablist");
    if (tabs && !tabs.querySelector(":scope > .fx-sep")) tabs.appendChild(makeSep());
  }

  /* ---------- 4.5 Видео-панель над всплывающими окнами ----------
     Любое окно, налезающее на правую колонку, поднимает видео-панель выше себя:
     высота подъёма → --fx-stack, высота панели → --fx-video-h.
     Если окно слишком высокое — панель переносится влево (data-fx-video="left"). */

  const IGNORE =
    `${S.video}, #tablist, ${S.tools}, ${S.inbox}, ${S.help}, ${S.profilePopup}, .fx-sep`;

  const videoStack = (() => {
    const tracked = new Set();
    let observedPanel = null;
    let panelWasShown = false;
    let blockedLeft = false;

    const schedule = rafOnce(update);
    const resizeObs = typeof ResizeObserver === "function" ? new ResizeObserver(schedule) : null;

    function track(el) {
      if (!(el instanceof HTMLElement) || tracked.has(el)) return;
      tracked.add(el);
      if (resizeObs) resizeObs.observe(el);
    }

    // fixed где угодно или absolute внутри дока — считаем всплывающим окном
    function consider(el, depth) {
      if (!(el instanceof HTMLElement)) return;
      if (el.closest(IGNORE) || el.querySelector(S.video)) return;

      const pos = getComputedStyle(el).position;
      const inDock = !!el.closest("#controls");
      // слишком широкие fixed-элементы (подложки, оверлеи) — не окна; ищем окно внутри них
      const tooWide = el.getBoundingClientRect().width > POPUP.maxW;

      if ((pos === "fixed" || (pos === "absolute" && inDock)) && !tooWide) {
        track(el);
        return;
      }

      if (depth < POPUP.maxDepth && el.childElementCount <= POPUP.maxChildren) {
        for (const child of el.children) consider(child, depth + 1);
      }
    }

    // на сколько px от низа окна должна стоять нижняя граница панели
    function computeLift(videoH) {
      const W = root.clientWidth;
      const H = window.innerHeight;
      const slot = {
        left: W - G.pillOffset - G.sideWidth,
        right: W - G.pillOffset,
        top: H - G.dockBottom - videoH,
        bottom: H - G.dockBottom,
      };

      let need = 0;

      for (const el of Array.from(tracked)) {
        if (!el.isConnected) {
          tracked.delete(el);
          if (resizeObs) resizeObs.unobserve(el);
          continue;
        }

        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;

        const r = el.getBoundingClientRect();
        if (r.width < POPUP.minW || r.height < POPUP.minH || r.width > POPUP.maxW) continue;
        if (r.right <= slot.left || r.left >= slot.right) continue;
        if (r.bottom <= slot.top || r.top >= slot.bottom) continue;

        need = Math.max(need, H - r.top + G.panelGap);
      }

      // выше окна можно подняться только до верхней плашки
      const maxNeed = Math.max(H - CONTENT_TOP - videoH, G.dockBottom);
      if (need > maxNeed + POPUP.blockTolerance) return { need: 0, blocked: true };
      return { need: Math.min(need, maxNeed), blocked: false };
    }

    function update() {
      const panel = document.querySelector(S.video);

      // панель может не добавляться в DOM, а показываться через display: none → block
      const shown = !!panel && panel.getClientRects().length > 0;
      if (shown && !panelWasShown) playEnter(panel);
      panelWasShown = shown;

      const wide = window.matchMedia(`(min-width: ${G.wideMin}px)`).matches;
      const videoH = panel && wide ? panel.scrollHeight : 0; // scrollHeight — без обрезки max-height
      setRootVar("--fx-video-h", videoH + "px");

      if (panel && panel !== observedPanel && resizeObs) {
        resizeObs.observe(panel);
        observedPanel = panel;
      }

      const { need, blocked } = videoH > 0 ? computeLift(videoH) : { need: 0, blocked: false };

      if (blocked !== blockedLeft) {
        blockedLeft = blocked;
        if (blocked) root.setAttribute("data-fx-video", "left");
        else root.removeAttribute("data-fx-video");
      }

      setRootVar("--fx-stack", need > G.dockBottom ? Math.ceil(need - G.dockBottom) + "px" : "0px");
    }

    return { track, consider, update, schedule };
  })();

  // окна часто появляются через анимацию — пересчитываем по её окончании
  document.addEventListener("transitionend", videoStack.schedule, true);
  document.addEventListener(
    "animationend",
    (e) => {
      videoStack.schedule();
      cleanupAnimation(e);
    },
    true
  );

  /* ---------- 4.6 Окна дока: поиск по заголовку ---------- */

  const EXCLUDE = "#tablist, #inbox-popup, #help-menu, #profile-popup-desktop";

  const isPopupTitle = (t) =>
    POPUP_TITLES.has(t) || (t.length < 40 && POPUP_TITLE_RE.test(t));

  function tagPopupFromText(textNode) {
    const title = textNode.nodeValue.trim();
    if (!isPopupTitle(title)) return;

    let el = textNode.parentElement;
    if (!el || el.closest(EXCLUDE)) return;

    // поднимаемся до ближайшего fixed/absolute-предка подходящей ширины
    for (; el && el !== document.body; el = el.parentElement) {
      const pos = getComputedStyle(el).position;
      if (pos !== "fixed" && pos !== "absolute") continue;

      const w = el.getBoundingClientRect().width;
      if (w < POPUP.titleMinW || w > POPUP.titleMaxW) continue;

      if (!el.hasAttribute("data-fixpopup")) playEnter(el);
      el.setAttribute("data-fixpopup", REVISION_TITLES.has(title) ? "revisions" : "1");
      videoStack.track(el);
      return;
    }
  }

  function scanForPopupTitles(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      tagPopupFromText(node);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let t;
    while ((t = walker.nextNode())) tagPopupFromText(t);
  }

  /* ---------- 4.7 Защита прокрутки при открытии/закрытии панелей ----------
     При закрытии поиска / My tabs / New tab сайт подбрасывает страницу вниз.
     Запоминаем прокрутку до открытия и возвращаем после закрытия: ~0.7 с откатываем
     скачки, пока пользователь сам ничего не крутил. */

  const scrollGuard = (() => {
    const GUARD_MS = 700;
    let free = window.scrollY; // последняя прокрутка, пока панелей не было
    let saved = null;
    let panelOpen = false;
    let guardUntil = 0;

    // вызывается синхронно из MutationObserver — раньше событий scroll
    function checkPanels() {
      const open = !!document.querySelector(S.panels);

      if (open && !panelOpen) {
        panelOpen = true;
        saved = free;
        guardUntil = 0;
      } else if (!open && panelOpen) {
        panelOpen = false;
        guardUntil = performance.now() + GUARD_MS;

        if (saved !== null && Math.abs(window.scrollY - saved) > 1) window.scrollTo(0, saved);
      }
    }

    window.addEventListener(
      "scroll",
      () => {
        if (panelOpen) return;

        if (saved !== null && performance.now() < guardUntil && Math.abs(window.scrollY - saved) > 1) {
          window.scrollTo(0, saved);
          return;
        }
        free = window.scrollY;
      },
      true
    );

    // пользователь сам начал крутить/нажимать — больше не вмешиваемся
    ["wheel", "touchmove", "keydown", "mousedown"].forEach((type) =>
      window.addEventListener(
        type,
        () => {
          if (!panelOpen) guardUntil = 0;
        },
        { capture: true, passive: true }
      )
    );

    return { checkPanels };
  })();

  /* ==========================================================
     5. ЗАПУСК
     ========================================================== */

  function watchDom() {
    const pending = new Set();
    let queued = false;
    // attributes: ["id"] — панели поиска и т.п. распознаются по id, он может смениться на месте
    const opts = { childList: true, subtree: true, attributes: true, attributeFilter: ["id"] };

    const mo = new MutationObserver((mutations) => {
      scrollGuard.checkPanels();

      for (const m of mutations) m.addedNodes.forEach((n) => pending.add(n));

      if (queued) return;
      queued = true;
      requestAnimationFrame(flush);
    });

    function flush() {
      queued = false;

      // отключаем наблюдатель, чтобы свои вставки (разделители и т.п.) не зацикливали его
      mo.disconnect();

      try {
        let considered = 0;

        pending.forEach((node) => {
          markEnter(node);
          scanForPopupTitles(node);
          if (node.nodeType === Node.ELEMENT_NODE && considered++ < POPUP.maxCandidatesPerBatch) {
            videoStack.consider(node, 0);
          }
        });
        pending.clear();

        syncDock();
        syncTopBar();
        videoStack.update();
      } finally {
        mo.observe(document.body, opts);
      }
    }

    mo.observe(document.body, opts);
  }

  function init() {
    watchDom();
    syncDock();
    syncTopBar();
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
