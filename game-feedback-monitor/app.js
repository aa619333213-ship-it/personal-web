(function () {
  const App = window.GameFeedbackMonitor;
  if (window.applyGameFeedbackBranding) {
    window.applyGameFeedbackBranding();
  }

  const state = {
    topic: "all",
    sentiment: "all",
    risk: "all",
    contentType: "all",
    sort: "time",
    page: 1,
    pageSize: 10,
  };

  const els = {
    riskCard: document.getElementById("risk-card"),
    riskWeather: document.getElementById("risk-weather"),
    gameName: document.getElementById("game-name"),
    sourceSummary: document.getElementById("source-summary"),
    riskLevelTitle: document.getElementById("risk-level-title"),
    riskBadge: document.getElementById("risk-badge"),
    riskScore: document.getElementById("risk-score"),
    riskChange: document.getElementById("risk-change"),
    riskNeedle: document.getElementById("risk-needle"),
    overviewMetrics: document.getElementById("overview-metrics"),
    headlineSystem: document.getElementById("headline-system"),
    headlineSummary: document.getElementById("headline-summary"),
    alertSummary: document.getElementById("alert-summary"),
    issueList: document.getElementById("issue-list"),
    alertList: document.getElementById("alert-list"),
    topicFilter: document.getElementById("topic-filter"),
    sentimentFilter: document.getElementById("sentiment-filter"),
    riskFilter: document.getElementById("risk-filter"),
    contentTypeFilter: document.getElementById("content-type-filter"),
    sortFilter: document.getElementById("sort-filter"),
    postStream: document.getElementById("post-stream"),
    postPagination: document.getElementById("post-pagination"),
    refreshButton: document.getElementById("refresh-button"),
    testAlertButton: document.getElementById("test-alert-button"),
  };

  async function init() {
    bindEvents();
    try {
      await renderAll();
    } catch (error) {
      renderLoadError(error);
    }
  }

  function bindEvents() {
    els.topicFilter.addEventListener("change", async (event) => {
      state.topic = event.target.value;
      state.page = 1;
      await safeRenderPosts();
    });

    els.sentimentFilter.addEventListener("change", async (event) => {
      state.sentiment = event.target.value;
      state.page = 1;
      await safeRenderPosts();
    });

    els.riskFilter.addEventListener("change", async (event) => {
      state.risk = event.target.value;
      state.page = 1;
      await safeRenderPosts();
    });

    els.contentTypeFilter.addEventListener("change", async (event) => {
      state.contentType = event.target.value;
      state.page = 1;
      await safeRenderPosts();
    });

    els.sortFilter.addEventListener("change", async (event) => {
      state.sort = event.target.value;
      state.page = 1;
      await safeRenderPosts();
    });

    els.refreshButton.addEventListener("click", async () => {
      els.refreshButton.disabled = true;
      els.refreshButton.textContent = "正在同步 Reddit 实时数据...";
      try {
        const syncResult = await App.fetchApi("/api/admin/sync", {}, "POST");
        if (syncResult && syncResult.ok) {
          window.location.reload();
          return;
        }
        throw new Error("sync failed");
      } catch (error) {
        renderLoadError(error);
      } finally {
        els.refreshButton.disabled = false;
        els.refreshButton.textContent = "刷新实时数据";
      }
    });

    els.testAlertButton.addEventListener("click", async () => {
      try {
        const result = await App.fetchApi("/api/alerts/test", {}, "POST");
        window.alert(result.message);
      } catch (error) {
        window.alert(`测试告警失败：${error.message}`);
      }
    });
  }

  async function renderAll() {
    const response = await App.fetchApi("/api/dashboard");
    renderOverview(response.overview);
    renderIssues(response.issues);
    renderAlerts(response.alerts);
    populateTopicFilter(response.taxonomy);
    await safeRenderPosts();
  }

  async function safeRenderPosts() {
    try {
      const query = new URLSearchParams({
        topic: state.topic,
        sentiment: state.sentiment,
        risk: state.risk,
        contentType: state.contentType,
        sort: state.sort,
        page: String(state.page),
        pageSize: String(state.pageSize),
      });
      const posts = await App.fetchApi(`/api/posts?${query.toString()}`);
      renderPosts(posts);
    } catch (error) {
      renderLoadError(error);
    }
  }

  function renderOverview(overview) {
    const sourceList = Array.isArray(overview.sources)
      ? overview.sources
      : overview.sources
        ? [overview.sources]
        : [];
    const weatherLevel = overview.weatherLevel || deriveWeatherLevel(overview.riskScore);
    const weatherLabel = displayWeatherLabel(overview.weatherLabel, weatherLevel);
    const scoreDelta = typeof overview.riskChange === "number" ? overview.riskChange : 0;
    const needleAngle =
      typeof overview.needleAngle === "number"
        ? overview.needleAngle
        : -90 + Math.max(0, Math.min(100, overview.riskScore || 0)) * 1.8;

    els.gameName.textContent = overview.game;
    els.sourceSummary.textContent = sourceList.join(" + ");
    els.riskLevelTitle.textContent = weatherLabel;
    els.riskBadge.className = App.riskBadgeClass(weatherLevel);
    els.riskBadge.textContent = weatherLabel;
    els.riskScore.textContent = overview.riskScore;
    els.riskChange.textContent = `较昨日 ${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`;
    if (els.riskNeedle) {
      els.riskNeedle.style.transform = `translateX(-50%) rotate(${needleAngle}deg)`;
    }
    renderWeatherFx(weatherLevel);

    els.headlineSystem.textContent = overview.topTopic
      ? `${overview.topTopic.label} 是当前主要风险源`
      : "当前整体风险稳定";
    els.headlineSummary.textContent = overview.executiveSummary;

    const metrics = [
      { label: "红色风险", value: overview.redRiskCount || 0, hint: "高危帖子/评论数" },
      { label: "橙色风险", value: overview.orangeRiskCount || 0, hint: "中危帖子/评论数" },
      { label: "讨论热度", value: App.formatNumber(overview.discussionHeat), hint: "点赞 + 评论" },
      { label: "预警数", value: overview.alertsCount || 0, hint: "需要跟进" },
    ];

    els.overviewMetrics.innerHTML = metrics
      .map(
        (item) =>
          `<div class="metric"><span>${item.label}</span><strong>${item.value}</strong><small>${item.hint}</small></div>`
      )
      .join("");
  }

  function deriveWeatherLevel(score) {
    if ((score || 0) > 80) {
      return "green";
    }
    if ((score || 0) >= 60) {
      return "orange";
    }
    return "red";
  }

  function weatherLabelFromLevel(level) {
    return {
      green: "晴",
      orange: "阴天",
      red: "雨天",
    }[level] || "阴天";
  }

  function displayWeatherLabel(rawLabel, level) {
    if (rawLabel === "sunny") {
      return "晴";
    }
    if (rawLabel === "cloudy") {
      return "阴天";
    }
    if (rawLabel === "rainy") {
      return "雨天";
    }
    return rawLabel || weatherLabelFromLevel(level);
  }

  function translateCopy(text) {
    const source = String(text || "");
    const dictionary = {
      "Immediate Intervention Required": "需立即介入",
      "Close Observation Needed": "重点观察",
      "Routine Feedback Collection": "常规收集",
      "Routine Monitoring": "常规监测",
      "Close Risk Watch": "重点观察",
      "Players are angry about value perception, especially pricing and pity progression.": "玩家集中抱怨定价、返利和付费价值感。",
      "Complaints focus on unfair ranked matches, solo players facing stacked groups, and weak match quality.": "玩家主要不满匹配不公平，以及单排遭遇车队带来的对局体验下滑。",
      "Feedback points to lag, disconnects, and unstable reset-hour performance.": "高峰时段的 Lag、掉线和活动开启时的稳定性问题正在累积。",
      "Players think the current patch compressed viable strategies and made the meta stale too quickly.": "玩家认为当前版本压缩了可用套路，环境固化得太快。",
      "Players do not trust competitive integrity and think visible cheaters stay active too long.": "玩家对竞技环境缺乏信任，认为明显作弊者处理太慢。",
      "New players are getting lost early and dropping before they understand core systems.": "新手玩家在早期阶段容易迷失，在理解核心系统前就流失。",
      "The grind-to-reward ratio feels off, especially when players compare daily effort to returns.": "玩家认为日常投入与回报失衡，养成收益感不足。",
      "Event pacing and rewards are under scrutiny, especially when expectations were raised by promotions.": "活动节奏与奖励正在被质疑，特别是宣传抬高预期之后。",
      "Players feel progression is too grind-heavy or blocked by unclear requirements.": "玩家认为成长线太肝，或被不清晰的要求卡住。",
      "Broken flows and recurring defects are dragging trust down.": "Bug 和流程故障反复出现，正在拉低玩家信任。",
      "Players feel social features are missing, clunky, or not rewarding enough.": "玩家觉得社交功能缺失、难用，或者反馈不足。",
      "Immediately align on external messaging for pity, pricing, and compensation boundaries.": "立即统一保底、定价和补偿边界的对外口径。",
      "Immediately communicate known issues and expected fix timing to reduce uncertainty.": "立即同步已知问题和预计修复时间，降低不确定性。",
      "Immediately isolate the biggest grind pain points and confirm whether progression gates should ease.": "立即梳理最主要的成长痛点，确认是否需要放松门槛。",
      "Immediately summarize the most criticized changes and decide between hotfix or observation.": "立即汇总争议最大的改动，判断是热修还是继续观察。",
      "Immediately clarify event value and timing expectations before dissatisfaction spreads further.": "立即澄清活动价值和时间安排，避免不满继续扩散。",
      "Immediately review queue quality and reset tuning, then prepare a status update for players.": "立即复核匹配质量和重置参数，并准备对外状态说明。",
      "Immediately prepare visible enforcement examples to rebuild trust in ranked integrity.": "立即准备可见的处罚案例，重建玩家对公平性的信任。",
      "Immediately publish a starter guide or FAQ that closes the biggest early-game confusion gaps.": "立即补充新手指南或 FAQ，覆盖早期最容易困惑的点。",
      "Immediately review daily reward pacing and confirm whether a short-term adjustment is needed.": "立即复核日常奖励节奏，确认是否需要短期调整。",
      "Immediately identify the weakest social touchpoints and prioritize one near-term improvement.": "立即找出最薄弱的社交触点，并优先做一个近期改进。",
      "Today summarize the most criticized changes and decide between hotfix or observation.": "今天汇总争议最大的改动，判断是热修还是继续观察。",
      "Today review queue quality and reset tuning, then prepare a status update for players.": "今天复核匹配质量和重置参数，并准备对外状态说明。",
      "Today prepare visible enforcement examples to rebuild trust in ranked integrity.": "今天准备可见的处罚案例，重建玩家对公平性的信任。",
      "This cycle communicate known issues and expected fix timing to reduce uncertainty.": "本周期持续同步已知问题和修复时间，降低不确定性。",
      "This cycle review daily reward pacing and confirm whether a short-term adjustment is needed.": "本周期复核日常奖励节奏，确认是否需要短期调整。",
      "This cycle identify the weakest social touchpoints and prioritize one near-term improvement.": "本周期找出最薄弱的社交触点，并优先做一个近期改进。",
      "This cycle verify capacity and reconnect stability before the next activity peak.": "本周期确认容量与重连稳定性，避免下一个高峰出问题。",
      "Critical keywords indicate boycott, refund, quit, scam, or exploit risk.": "命中了高危关键词，存在退坑、退款、诈骗或漏洞扩散风险。",
      "Warning keywords indicate balance, whale, or nerf driven dissatisfaction.": "命中了预警关键词，当前不满主要来自平衡、付费压力或削弱争议。",
      "Feishu + WeCom": "飞书 + 企业微信",
      "Dashboard + Feishu": "看板 + 飞书",
      "Overseas Ops": "海外运营",
    };

    return dictionary[source] || source;
  }

  function renderWeatherFx(level) {
    if (!els.riskCard || !els.riskWeather) {
      return;
    }

    const mode = level === "green" ? "sunny" : level === "orange" ? "cloudy" : "rainy";
    els.riskCard.classList.remove("weather-sunny", "weather-cloudy", "weather-rainy");
    els.riskCard.classList.add(`weather-${mode}`);

    if (mode === "sunny") {
      els.riskWeather.innerHTML = `
        <span class="sun-orb"></span>
        <span class="sun-ray ray-1"></span>
        <span class="sun-ray ray-2"></span>
        <span class="sun-ray ray-3"></span>
        <span class="sun-glow glow-1"></span>
        <span class="sun-glow glow-2"></span>
      `;
      return;
    }

    if (mode === "cloudy") {
      els.riskWeather.innerHTML = `
        <span class="cloud cloud-1"></span>
        <span class="cloud cloud-2"></span>
        <span class="cloud cloud-3"></span>
      `;
      return;
    }

    els.riskWeather.innerHTML = `
      <span class="cloud cloud-1"></span>
      <span class="cloud cloud-2"></span>
      <span class="rain-drop drop-1"></span>
      <span class="rain-drop drop-2"></span>
      <span class="rain-drop drop-3"></span>
      <span class="rain-drop drop-4"></span>
      <span class="rain-drop drop-5"></span>
      <span class="rain-drop drop-6"></span>
    `;
  }

  function renderIssues(issues) {
    els.issueList.innerHTML = issues
      .map(
        (item, index) => `
      <section class="issue-card">
        <div class="issue-head">
          <div>
            <div class="issue-title-row">
              <span class="${App.riskBadgeClass(item.riskLevel)}">${App.formatRiskLabel(item.riskLevel)}</span>
              <h4>${index + 1}. ${item.label}</h4>
            </div>
            <p class="summary-text">${translateCopy(item.rootCause)}</p>
          </div>
          <strong>${item.riskScore}</strong>
        </div>
        <div class="trend-bars">${App.renderTrendBars(item.trend || [])}</div>
        <div class="issue-summary">
          <div class="summary-block"><strong>风险占比</strong><span>${App.formatPercent(item.negativeShare || 0)}</span></div>
          <div class="summary-block"><strong>变化</strong><span>${Math.round((item.growth || 0) * 100)}%</span></div>
          <div class="summary-block"><strong>热度</strong><span>${App.formatNumber(item.heat || 0)}</span></div>
          <div class="summary-block"><strong>处理等级</strong><span>${translateCopy(item.riskCopy || "")}</span></div>
        </div>
        <div class="summary-block"><strong>建议动作</strong><span>${translateCopy(item.actionSuggestion || "")}</span></div>
        ${
          item.representativePost
            ? `<div class="summary-block"><strong>代表帖子</strong><a class="post-link" href="${item.representativePost.post_url || item.representativePost.url}" target="_blank" rel="noreferrer">${item.representativePost.title}</a></div>`
            : ""
        }
      </section>`
      )
      .join("");
  }

  function renderAlerts(alerts) {
    els.alertSummary.innerHTML = alerts.length
      ? alerts
          .slice(0, 3)
          .map(
            (alert) => `
      <div class="stack-item">
        <strong>${alert.topic_label || alert.topic}</strong>
        <p>${translateCopy(alert.trigger_reason || alert.reason)}</p>
      </div>`
          )
          .join("")
      : `<div class="empty-state">当前没有实时预警。</div>`;

    els.alertList.innerHTML = alerts.length
      ? alerts
          .map(
            (alert) => `
      <div class="stack-item">
        <div class="issue-title-row">
          <span class="${App.riskBadgeClass(alert.risk_level || alert.riskLevel)}">${App.formatRiskLabel(alert.risk_level || alert.riskLevel)}</span>
          <strong>${alert.topic_label || alert.title || alert.topic}</strong>
        </div>
        <p>${translateCopy(alert.trigger_reason || alert.reason)}</p>
        <p><strong>负责人：</strong>${translateCopy(alert.owner_name || alert.owner || "-")}</p>
        <p><strong>通知渠道：</strong>${translateCopy(alert.delivery_channel || alert.channel || "-")}</p>
        <p>${translateCopy(alert.action_suggestion || alert.recommendation || "")}</p>
        ${
          alert.representative_post_url || alert.postUrl
            ? `<a class="post-link" href="${alert.representative_post_url || alert.postUrl}" target="_blank" rel="noreferrer">打开代表帖子</a>`
            : ""
        }
      </div>`
          )
          .join("")
      : `<div class="empty-state">当前没有需要跟进的预警。</div>`;
  }

  function populateTopicFilter(taxonomy) {
    const currentValue = els.topicFilter.value || state.topic;
    els.topicFilter.innerHTML =
      `<option value="all">全部系统</option>` +
      taxonomy.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
    els.topicFilter.value = currentValue;
  }

  function renderPosts(payload) {
    const posts = payload && Array.isArray(payload.items) ? payload.items : [];
    els.postStream.innerHTML = posts.length
      ? posts.map((post) => renderPostCard(post)).join("")
      : `<div class="empty-state">当前筛选条件下没有内容。</div>`;
    renderPagination(payload);
  }

  function renderPagination(payload) {
    const page = payload && payload.page ? payload.page : 1;
    const pageSize = payload && payload.pageSize ? payload.pageSize : state.pageSize;
    const total = payload && typeof payload.total === "number" ? payload.total : 0;
    const totalPages = payload && payload.totalPages ? payload.totalPages : 1;
    const start = total ? (page - 1) * pageSize + 1 : 0;
    const end = total ? Math.min(page * pageSize, total) : 0;

    els.postPagination.innerHTML = `
      <div class="pagination-status">显示 ${start}-${end} / ${total} 条，近 72 小时内容</div>
      <div class="pagination-actions">
        <button class="button button-secondary" data-page-action="prev" ${page <= 1 ? "disabled" : ""}>上一页</button>
        <span class="pagination-status">第 ${page} / ${Math.max(1, totalPages)} 页</span>
        <button class="button button-secondary" data-page-action="next" ${page >= totalPages ? "disabled" : ""}>下一页</button>
      </div>
    `;

    const prevButton = els.postPagination.querySelector('[data-page-action="prev"]');
    const nextButton = els.postPagination.querySelector('[data-page-action="next"]');

    if (prevButton) {
      prevButton.addEventListener("click", async () => {
        if (state.page <= 1) {
          return;
        }
        state.page -= 1;
        await safeRenderPosts();
      });
    }

    if (nextButton) {
      nextButton.addEventListener("click", async () => {
        if (state.page >= totalPages) {
          return;
        }
        state.page += 1;
        await safeRenderPosts();
      });
    }
  }

  function renderPostCard(post) {
    const typeLabel = post.postType === "submission" ? "帖子" : "评论";
    const topComment =
      post.postType === "submission" && post.topCommentPreview
        ? `
        <div class="top-comment-preview">
          <div class="top-comment-header">
            <strong>最高热评</strong>
            <span>${post.topCommentPreview.author} | ${post.topCommentPreview.score} 赞</span>
          </div>
          <p>${post.topCommentPreview.body || ""}</p>
          <a class="post-link" href="${post.topCommentPreview.url}" target="_blank" rel="noreferrer">打开这条评论</a>
        </div>`
        : "";

    return `
      <article class="post-card">
        <div class="post-head">
          <div>
            <div class="post-title-row">
              <span class="topic-chip">${App.topicLabel(post.topic)}</span>
              <span class="chip">${typeLabel}</span>
              <span class="chip sentiment-${post.sentiment}">${App.sentimentLabel(post.sentiment)}</span>
              <span class="${App.riskBadgeClass(post.riskLevel)}">${App.formatRiskLabel(post.riskLevel)}</span>
            </div>
            <div class="post-title">${post.title}</div>
          </div>
          <div class="post-meta">${App.relativeDate(post.createdAt)}</div>
        </div>
        <p class="post-excerpt">${post.body || ""}</p>
        <div class="issue-summary">
          <div class="summary-block"><strong>处理等级</strong><span>${translateCopy(post.riskCopy || "")}</span></div>
          <div class="summary-block"><strong>根因摘要</strong><span>${translateCopy(post.rootCause || "")}</span></div>
          <div class="summary-block"><strong>建议动作</strong><span>${translateCopy(post.actionSuggestion || "")}</span></div>
        </div>
        ${topComment}
        <div class="post-meta">r/${post.subreddit} | 作者 ${post.author} | ${post.score} 赞 | ${post.commentsCount} 评论</div>
        <a class="post-link" href="${post.url}" target="_blank" rel="noreferrer">打开 Reddit 原帖</a>
      </article>`;
  }

  function renderLoadError(error) {
    const message = error && error.message ? error.message : "未知错误";
    const html = `<div class="empty-state">实时接口异常：${message}</div>`;
    els.issueList.innerHTML = html;
    els.alertList.innerHTML = html;
    els.postStream.innerHTML = html;
    els.postPagination.innerHTML = "";
  }

  init();
})();
