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
  };

  const els = {
    gameName: document.getElementById("game-name"),
    sourceSummary: document.getElementById("source-summary"),
    riskLevelTitle: document.getElementById("risk-level-title"),
    riskBadge: document.getElementById("risk-badge"),
    riskScore: document.getElementById("risk-score"),
    riskChange: document.getElementById("risk-change"),
    riskMeterFill: document.getElementById("risk-meter-fill"),
    overviewMetrics: document.getElementById("overview-metrics"),
    headlineSystem: document.getElementById("headline-system"),
    headlineSummary: document.getElementById("headline-summary"),
    alertSummary: document.getElementById("alert-summary"),
    issueList: document.getElementById("issue-list"),
    alertList: document.getElementById("alert-list"),
    taxonomyList: document.getElementById("taxonomy-list"),
    topicFilter: document.getElementById("topic-filter"),
    sentimentFilter: document.getElementById("sentiment-filter"),
    riskFilter: document.getElementById("risk-filter"),
    contentTypeFilter: document.getElementById("content-type-filter"),
    sortFilter: document.getElementById("sort-filter"),
    postStream: document.getElementById("post-stream"),
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
      await safeRenderPosts();
    });
    els.sentimentFilter.addEventListener("change", async (event) => {
      state.sentiment = event.target.value;
      await safeRenderPosts();
    });
    els.riskFilter.addEventListener("change", async (event) => {
      state.risk = event.target.value;
      await safeRenderPosts();
    });
    els.contentTypeFilter.addEventListener("change", async (event) => {
      state.contentType = event.target.value;
      await safeRenderPosts();
    });
    els.sortFilter.addEventListener("change", async (event) => {
      state.sort = event.target.value;
      await safeRenderPosts();
    });

    els.refreshButton.addEventListener("click", async () => {
      els.refreshButton.disabled = true;
      els.refreshButton.textContent = "正在同步 Reddit 实时数据...";
      try {
        await App.fetchApi("/api/admin/sync", {}, "POST");
        await renderAll();
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
    const [overview, issues, posts, alerts] = await Promise.all([
      App.fetchApi("/api/dashboard/overview"),
      App.fetchApi("/api/issues"),
      App.fetchApi("/api/posts"),
      App.fetchApi("/api/alerts"),
    ]);

    const dataset = App.getDataset();
    renderOverview(overview);
    renderIssues(issues);
    renderAlerts(alerts);
    renderTaxonomy(dataset.taxonomy);
    populateTopicFilter(dataset.taxonomy);
    renderPosts(posts);
  }

  async function safeRenderPosts() {
    try {
      const posts = await App.fetchApi("/api/posts");
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

    els.gameName.textContent = overview.game;
    els.sourceSummary.textContent = sourceList.join(" + ");
    els.riskLevelTitle.textContent = App.formatRiskLabel(overview.riskLevel);
    els.riskBadge.className = App.riskBadgeClass(overview.riskLevel);
    els.riskBadge.textContent = App.formatRiskLabel(overview.riskLevel);
    els.riskScore.textContent = overview.riskScore;
    els.riskChange.textContent = `较昨日 +${overview.riskChange}`;
    els.riskMeterFill.style.width = `${Math.max(4, overview.riskScore)}%`;
    els.headlineSystem.textContent = overview.topTopic
      ? `${overview.topTopic.label} 正在升温`
      : "当前暂无明显高风险";
    els.headlineSummary.textContent = overview.executiveSummary;

    const metrics = [
      { label: "负面内容", value: overview.negativeVolume, hint: "负向帖子/评论数" },
      { label: "增长", value: `${Math.round(overview.growthRate * 100)}%`, hint: "相对近期基线" },
      { label: "讨论热度", value: App.formatNumber(overview.discussionHeat), hint: "点赞 + 评论" },
      { label: "预警数", value: overview.alertsCount, hint: "需要跟进" },
      { label: "处理建议", value: overview.riskCopy || "", hint: "运营口径" },
    ];

    els.overviewMetrics.innerHTML = metrics
      .map(
        (item) =>
          `<div class="metric"><span>${item.label}</span><strong>${item.value}</strong><small>${item.hint}</small></div>`
      )
      .join("");
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
            <p class="summary-text">${item.rootCause}</p>
          </div>
          <strong>${item.riskScore}</strong>
        </div>
        <div class="trend-bars">${App.renderTrendBars(item.trend || [])}</div>
        <div class="issue-summary">
          <div class="summary-block"><strong>负面占比</strong><span>${App.formatPercent(item.negativeShare || 0)}</span></div>
          <div class="summary-block"><strong>增长</strong><span>${Math.round((item.growth || 0) * 100)}%</span></div>
          <div class="summary-block"><strong>热度</strong><span>${App.formatNumber(item.heat || 0)}</span></div>
          <div class="summary-block"><strong>处理等级</strong><span>${item.riskCopy || ""}</span></div>
        </div>
        <div class="summary-block"><strong>建议动作</strong><span>${item.actionSuggestion || ""}</span></div>
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
        <p>${alert.trigger_reason || alert.reason}</p>
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
        <p>${alert.trigger_reason || alert.reason}</p>
        <p><strong>负责人：</strong>${alert.owner_name || alert.owner || "-"}</p>
        <p><strong>通知渠道：</strong>${alert.delivery_channel || alert.channel || "-"}</p>
        <p>${alert.action_suggestion || alert.recommendation || ""}</p>
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

  function renderTaxonomy(taxonomy) {
    els.taxonomyList.innerHTML = taxonomy
      .map(
        (item) => `
      <div class="taxonomy-item">
        <strong>${item.label}</strong>
        <p>${(item.aliases || []).join(" / ")}</p>
      </div>`
      )
      .join("");
  }

  function populateTopicFilter(taxonomy) {
    const currentValue = els.topicFilter.value || state.topic;
    els.topicFilter.innerHTML =
      `<option value="all">全部系统</option>` +
      taxonomy.map((item) => `<option value="${item.key}">${item.label}</option>`).join("");
    els.topicFilter.value = currentValue;
  }

  function normalizePosts(posts) {
    return posts
      .filter((post) => !post.ignored)
      .filter((post) => (state.topic === "all" ? true : post.topic === state.topic))
      .filter((post) => (state.sentiment === "all" ? true : post.sentiment === state.sentiment))
      .filter((post) => (state.risk === "all" ? true : post.riskLevel === state.risk))
      .filter((post) => (state.contentType === "all" ? true : post.postType === state.contentType))
      .sort((left, right) => {
        if (state.sort === "heat") {
          const leftHeat = (left.score || 0) + (left.commentsCount || 0) * 3;
          const rightHeat = (right.score || 0) + (right.commentsCount || 0) * 3;
          return rightHeat - leftHeat;
        }
        return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      });
  }

  function renderPosts(providedPosts) {
    const posts = normalizePosts(providedPosts || []);
    els.postStream.innerHTML = posts.length
      ? posts.map((post) => renderPostCard(post)).join("")
      : `<div class="empty-state">当前筛选条件下没有内容。</div>`;
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
          <div class="summary-block"><strong>处理等级</strong><span>${post.riskCopy || ""}</span></div>
          <div class="summary-block"><strong>根因摘要</strong><span>${post.rootCause || ""}</span></div>
          <div class="summary-block"><strong>建议动作</strong><span>${post.actionSuggestion || ""}</span></div>
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
  }

  init();
})();
