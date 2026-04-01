(function () {
  const uiConfig = {
    brand: {
      productName: "海外玩家反馈监控台",
      englishName: "Overseas Ops Radar",
      gameName: "王国纪元 / Rise of Kingdoms",
      gameKey: "rise-of-kingdoms",
      monitoringSummary:
        "聚焦 Reddit 玩家反馈，快速识别最不满的系统、负面扩散速度和运营风险。",
      sourcesLabel: "r/RiseofKingdoms",
    },
    copy: {
      dashboardTitle: "3 分钟看清今天最值得关注的玩家风险",
      dashboardSubtitle:
        "把负面声量、增速、热度和高影响帖子放到一个清晰视图里，方便运营快速判断。",
      reportsTitle: "每日报告",
      reportsSubtitle:
        "把今天的 Reddit 玩家反馈整理成适合晨会、同步和汇报使用的日报。",
      reviewTitle: "人工校正台",
      reviewSubtitle:
        "修正主题分类、情绪判断和误报内容，同时维护风险关键词与情绪词表。",
    },
    theme: {
      bg: "#f4efe5",
      bgAccent:
        "radial-gradient(circle at top right, rgba(214, 104, 56, 0.22), transparent 28%), radial-gradient(circle at top left, rgba(22, 121, 171, 0.18), transparent 24%), linear-gradient(180deg, #f7f2e9 0%, #efe8dc 100%)",
      surface: "rgba(255, 252, 246, 0.8)",
      surfaceStrong: "#fffdf7",
      text: "#1f252e",
      muted: "#5d6673",
      line: "rgba(31, 37, 46, 0.1)",
      brand: "#0d6c91",
      brandDeep: "#0a4d67",
      warning: "#dc7d2d",
      danger: "#d94b3d",
      success: "#2f8c62",
      yellow: "#d0a020",
      shadow: "0 18px 48px rgba(65, 48, 31, 0.08)",
    },
    riskPalette: {
      greenLabel: "绿色",
      orangeLabel: "橙色",
      redLabel: "红色",
    },
  };

  function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty("--bg", theme.bg);
    root.style.setProperty("--bg-accent", theme.bgAccent);
    root.style.setProperty("--surface", theme.surface);
    root.style.setProperty("--surface-strong", theme.surfaceStrong);
    root.style.setProperty("--text", theme.text);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--line", theme.line);
    root.style.setProperty("--brand", theme.brand);
    root.style.setProperty("--brand-deep", theme.brandDeep);
    root.style.setProperty("--warning", theme.warning);
    root.style.setProperty("--danger", theme.danger);
    root.style.setProperty("--success", theme.success);
    root.style.setProperty("--yellow", theme.yellow);
    root.style.setProperty("--shadow", theme.shadow);
  }

  function applyBranding() {
    applyTheme(uiConfig.theme);
    document.title = uiConfig.brand.productName;

    const gameName = document.getElementById("game-name");
    if (gameName) gameName.textContent = uiConfig.brand.gameName;

    const sourceSummary = document.getElementById("source-summary");
    if (sourceSummary) sourceSummary.textContent = uiConfig.brand.sourcesLabel;

    const page = document.body.dataset.page;

    if (page === "dashboard") {
      const eyebrow = document.querySelector(".sidebar .eyebrow");
      const h1 = document.querySelector(".sidebar h1");
      const sidebarCopy = document.querySelector(".sidebar-copy");
      const heroTitle = document.querySelector(".hero h2");
      const heroCopy = document.querySelector(".hero-copy");
      if (eyebrow) eyebrow.textContent = uiConfig.brand.englishName;
      if (h1) h1.textContent = uiConfig.brand.productName;
      if (sidebarCopy) sidebarCopy.textContent = uiConfig.brand.monitoringSummary;
      if (heroTitle) heroTitle.textContent = uiConfig.copy.dashboardTitle;
      if (heroCopy) heroCopy.textContent = uiConfig.copy.dashboardSubtitle;
    }

    if (page === "reports") {
      const h1 = document.querySelector(".sidebar h1");
      const sidebarCopy = document.querySelector(".sidebar-copy");
      if (h1) h1.textContent = uiConfig.copy.reportsTitle;
      if (sidebarCopy) sidebarCopy.textContent = uiConfig.copy.reportsSubtitle;
    }

    if (page === "review") {
      const h1 = document.querySelector(".sidebar h1");
      const sidebarCopy = document.querySelector(".sidebar-copy");
      if (h1) h1.textContent = uiConfig.copy.reviewTitle;
      if (sidebarCopy) sidebarCopy.textContent = uiConfig.copy.reviewSubtitle;
    }
  }

  window.GameFeedbackUIConfig = uiConfig;
  window.applyGameFeedbackBranding = applyBranding;
})();
