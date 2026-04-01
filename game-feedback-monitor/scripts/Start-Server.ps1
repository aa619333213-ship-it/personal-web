param(
  [int]$Port = 8899
)

$ErrorActionPreference = "Stop"

$ProjectRoot = "C:\Users\Administrator\Documents\game-feedback-monitor"
$DataDir = "$ProjectRoot\data"
$StorePath = "$ProjectRoot\data\store.json"
$SourcesPath = "$ProjectRoot\data\sources.json"
$ServerLogPath = "$ProjectRoot\server.runtime.log"
Add-Type -AssemblyName System.Web.Extensions

function Write-ServerLog {
  param([string]$Message)
  $line = "[{0}] {1}" -f (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffK"), $Message
  Add-Content -Path $ServerLogPath -Value $line -Encoding UTF8
}

function Read-JsonFile {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return $null }
  return (Get-Content $Path -Raw | ConvertFrom-Json)
}

function Write-JsonFile {
  param(
    [string]$Path,
    $Data
  )
  $json = $Data | ConvertTo-Json -Depth 100
  if ([string]::IsNullOrWhiteSpace($json)) {
    $json = "{}"
  }
  [System.IO.File]::WriteAllText($Path, $json, [System.Text.UTF8Encoding]::new($false))
}

function Sanitize-Text {
  param([AllowNull()][string]$Text)
  if ($null -eq $Text) { return "" }
  $value = $Text -replace "[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]", " "
  $value = $value -replace [string][char]0x2028, " "
  $value = $value -replace [string][char]0x2029, " "
  $value = $value -replace "[^\u0009\u000A\u000D\u0020-\u007E]", " "
  $value = $value -replace "\s{2,}", " "
  return $value.Trim()
}

function Ensure-Store {
  if (-not (Test-Path $StorePath)) {
    $seed = @{
      meta = @{ lastSyncAt = $null; game = "Project Vanguard" }
      raw_posts = @()
      analyzed_feedback = @()
      risk_daily_snapshot = @()
      alerts = @()
      review_labels = @()
      daily_reports = @()
      rule_config = @{
        risk = @{
          red = @("quit","delete","refund","scam","cheat")
          orange = @("nerf","unbalanced","lag","toxic","impossible")
          green = @("guide","help","best")
        }
        sentiment = @{
          negativePhrases = @("!!!","FUCK","SICK")
          positive = @("love","thanks","awesome")
        }
      }
    }
    Write-JsonFile -Path $StorePath -Data $seed
  }
}

function Get-DefaultRuleConfig {
  return @{
    risk = @{
      red = @("quit","delete","refund","scam","cheat")
      orange = @("nerf","unbalanced","lag","toxic","impossible")
      green = @("guide","help","best")
    }
    sentiment = @{
      negativePhrases = @("!!!","FUCK","SICK")
      positive = @("love","thanks","awesome")
    }
  }
}

function Get-RuleConfig {
  Ensure-Store
  $store = Read-JsonFile -Path $StorePath
  if (-not $store.rule_config) {
    $defaultRules = Get-DefaultRuleConfig
    if ($store.PSObject.Properties.Name -contains "rule_config") {
      $store.rule_config = $defaultRules
    } else {
      $store | Add-Member -NotePropertyName "rule_config" -NotePropertyValue $defaultRules
    }
    Write-JsonFile -Path $StorePath -Data $store
  }
  return $store.rule_config
}

function Get-LiveAnalysisItems {
  param($Store)
  $items = foreach ($raw in $Store.raw_posts) {
    $topic = Get-Topic -Text $raw.combined_text
    $sentiment = Get-Sentiment -Text $raw.combined_text
    $riskLevel = Get-ContentRiskLevel -Text $raw.combined_text
    $impact = [Math]::Round([Math]::Min(1, (($raw.score + ($raw.comments_count * 2)) / 500.0)), 2)
    $review = $Store.review_labels | Where-Object { $_.postId -eq $raw.external_id } | Select-Object -First 1
    $resolvedTopicKey = if ($review.corrected_topic_key) { $review.corrected_topic_key } else { $topic }
    $resolvedSentiment = if ($review.corrected_sentiment) { $review.corrected_sentiment } else { $sentiment }
    [pscustomobject]@{
      external_id = $raw.external_id
      topic_key = $resolvedTopicKey
      sentiment = $resolvedSentiment
      impact = $impact
      root_cause_summary = $((Get-TopicRootCause -TopicKey $resolvedTopicKey))
      action_suggestion = ""
      risk_score = Get-RiskScoreFromLevel -RiskLevel $riskLevel
      risk_level = $riskLevel
      ignored = [bool]$review.ignored
    }
  }
  return @($items)
}

function Get-TopicTaxonomy {
  return @(
    @{ key = "matchmaking"; label = "Matchmaking"; aliases = @("queue","ranked","matchmaking","premade","mmr","match") }
    @{ key = "economy"; label = "Economy"; aliases = @("resource","gold","price","economy","reward","currency") }
    @{ key = "monetization"; label = "Monetization"; aliases = @("gacha","banner","shop","spend","pity","monetization","cash") }
    @{ key = "event"; label = "Event"; aliases = @("event","anniversary","limited","calendar","festival") }
    @{ key = "progression"; label = "Progression"; aliases = @("grind","xp","level","progression","farm","upgrade") }
    @{ key = "balance"; label = "Balance"; aliases = @("balance","meta","nerf","buff","op","underpowered") }
    @{ key = "server"; label = "Server"; aliases = @("lag","disconnect","server","ping","rubber band","latency") }
    @{ key = "bug"; label = "Bug"; aliases = @("bug","crash","broken","stuck","glitch","issue") }
    @{ key = "anti-cheat"; label = "Anti-Cheat"; aliases = @("hack","cheat","bot","aimbot","exploit") }
    @{ key = "social"; label = "Social"; aliases = @("guild","friend","chat","social","party","clan") }
    @{ key = "onboarding"; label = "Onboarding"; aliases = @("tutorial","new player","beginner","onboarding","first hour") }
  )
}

function Get-TopicRootCause {
  param([string]$TopicKey)
  $map = @{
    "monetization" = "Players are angry about value perception, especially pricing and pity progression."
    "matchmaking" = "Complaints focus on unfair ranked matches, solo players facing stacked groups, and weak match quality."
    "server" = "Feedback points to lag, disconnects, and unstable reset-hour performance."
    "balance" = "Players think the current patch compressed viable strategies and made the meta stale too quickly."
    "anti-cheat" = "Players do not trust competitive integrity and think visible cheaters stay active too long."
    "onboarding" = "New players are getting lost early and dropping before they understand core systems."
    "economy" = "The grind-to-reward ratio feels off, especially when players compare daily effort to returns."
    "event" = "Event pacing and rewards are under scrutiny, especially when expectations were raised by promotions."
    "progression" = "Players feel progression is too grind-heavy or blocked by unclear requirements."
    "bug" = "Broken flows and recurring defects are dragging trust down."
    "social" = "Players feel social features are missing, clunky, or not rewarding enough."
  }
  return $map[$TopicKey]
}

function Get-ActionSuggestion {
  param(
    [string]$TopicKey,
    [string]$RiskLevel,
    [int]$Volume
  )
  $urgency = switch ($RiskLevel) {
    "red" { "Immediately" }
    "orange" { "Today" }
    default { "This cycle" }
  }

  $map = @{
    "monetization" = "$urgency align on external messaging for pity, pricing, and compensation boundaries."
    "matchmaking" = "$urgency review queue quality and reset tuning, then prepare a status update for players."
    "server" = "$urgency verify capacity and reconnect stability before the next activity peak."
    "balance" = "$urgency summarize the most criticized changes and decide between hotfix or observation."
    "anti-cheat" = "$urgency prepare visible enforcement examples to rebuild trust in ranked integrity."
    "onboarding" = "$urgency publish a starter guide or FAQ that closes the biggest early-game confusion gaps."
    "economy" = "$urgency review daily reward pacing and confirm whether a short-term adjustment is needed."
    "event" = "$urgency clarify event value and timing expectations before dissatisfaction spreads further."
    "progression" = "$urgency isolate the biggest grind pain points and confirm whether progression gates should ease."
    "bug" = "$urgency communicate known issues and expected fix timing to reduce uncertainty."
    "social" = "$urgency identify the weakest social touchpoints and prioritize one near-term improvement."
  }

  if ($map.ContainsKey($TopicKey)) { return $map[$TopicKey] }
  return "$urgency review $Volume related items and confirm the next operator action."
}

function Get-Sentiment {
  param([string]$Text)
  $rules = Get-RuleConfig
  $lower = $Text.ToLowerInvariant()
  foreach ($phrase in @($rules.sentiment.negativePhrases)) {
    if ($phrase -eq "!!!" -and $Text -match '!{3,}') { return "negative" }
    if ($phrase -ne "!!!" -and $Text -cmatch ("\b" + [regex]::Escape($phrase) + "\b")) { return "negative" }
  }
  foreach ($word in @($rules.sentiment.positive)) {
    if ($lower -match ("\b" + [regex]::Escape($word.ToLowerInvariant()) + "\b")) { return "positive" }
  }
  return "neutral"
}

function Get-Topic {
  param([string]$Text)
  $lower = $Text.ToLowerInvariant()
  foreach ($topic in (Get-TopicTaxonomy)) {
    foreach ($alias in $topic.aliases) {
      if ($lower.Contains($alias)) { return $topic.key }
    }
  }
  return "bug"
}

function Get-RiskLevel {
  param([int]$Score)
  if ($Score -ge 80) { return "red" }
  if ($Score -ge 50) { return "orange" }
  return "green"
}

function Get-RiskPriority {
  param([string]$RiskLevel)
  switch ($RiskLevel) {
    "red" { return 3 }
    "orange" { return 2 }
    default { return 1 }
  }
}

function Get-RiskScoreFromLevel {
  param([string]$RiskLevel)
  switch ($RiskLevel) {
    "red" { return 90 }
    "orange" { return 65 }
    default { return 25 }
  }
}

function Get-RiskDisplayCopy {
  param([string]$RiskLevel)
  switch ($RiskLevel) {
    "red" { return "Immediate Intervention Required" }
    "orange" { return "Close Observation Needed" }
    default { return "Routine Feedback Collection" }
  }
}

function Get-ContentRiskLevel {
  param([string]$Text)
  $rules = Get-RuleConfig
  $lower = $Text.ToLowerInvariant()
  foreach ($word in @($rules.risk.red)) {
    if ($lower -match ("\b" + [regex]::Escape($word.ToLowerInvariant()) + "\b")) { return "red" }
  }
  foreach ($word in @($rules.risk.orange)) {
    if ($lower -match ("\b" + [regex]::Escape($word.ToLowerInvariant()) + "\b")) { return "orange" }
  }
  return "green"
}

function Invoke-RedditRequest {
  param([string]$Url)
  $headers = @{ "User-Agent" = "GameFeedbackMonitor/1.0 (Windows PowerShell)" }
  return Invoke-RestMethod -Headers $headers -Uri $Url -Method Get
}

function Get-RedditFeedback {
  $sources = Read-JsonFile -Path $SourcesPath
  $postsPerSubreddit = [Math]::Min([int]$sources.limits.postsPerSubreddit, 100)
  $commentsPerPost = [int]$sources.limits.commentsPerPost
  $lookbackDays = if ($sources.lookbackDays) { [int]$sources.lookbackDays } else { 3 }
  $cutoffUtc = (Get-Date).ToUniversalTime().AddDays(-1 * $lookbackDays)
  $results = @()

  foreach ($subreddit in $sources.subreddits) {
    $after = $null
    $reachedCutoff = $false
    $pageCount = 0

    try {
      while (-not $reachedCutoff -and $pageCount -lt 10) {
        $pageCount += 1
        $url = "https://www.reddit.com/r/$subreddit/new.json?limit=$postsPerSubreddit"
        if ($after) {
          $url += "&after=$after"
        }
        $listing = Invoke-RedditRequest -Url $url
        if (-not $listing.data.children -or $listing.data.children.Count -eq 0) {
          break
        }

        foreach ($child in $listing.data.children) {
          $post = $child.data
          $postCreatedUtc = [DateTimeOffset]::FromUnixTimeSeconds([int64]$post.created_utc).UtcDateTime
          if ($postCreatedUtc -lt $cutoffUtc) {
            $reachedCutoff = $true
            continue
          }

          $postTitle = Sanitize-Text ([string]$post.title)
          $postBody = Sanitize-Text ([string]$post.selftext)
          $combinedText = Sanitize-Text "$postTitle $postBody"
          $results += [pscustomobject]@{
            external_id = "t3_$($post.id)"
            parent_id = $null
            platform = "reddit"
            subreddit = $subreddit
            post_type = "submission"
            title = $postTitle
            body = $postBody
            author_name = (Sanitize-Text ([string]$post.author))
            score = [int]$post.score
            comments_count = [int]$post.num_comments
            post_url = "https://www.reddit.com$($post.permalink)"
            created_at_source = $postCreatedUtc.ToString("o")
            combined_text = $combinedText.Trim()
          }

          try {
            $commentResponse = Invoke-RedditRequest -Url "https://www.reddit.com$($post.permalink).json?limit=$commentsPerPost&depth=1"
            $commentListing = $commentResponse[1]
            $counter = 0
            foreach ($commentChild in $commentListing.data.children) {
              if ($commentChild.kind -ne "t1") { continue }
              if ($counter -ge $commentsPerPost) { break }
              $comment = $commentChild.data
              if ([string]::IsNullOrWhiteSpace($comment.body)) { continue }
              $commentCreatedUtc = [DateTimeOffset]::FromUnixTimeSeconds([int64]$comment.created_utc).UtcDateTime
              if ($commentCreatedUtc -lt $cutoffUtc) { continue }
              $commentBody = Sanitize-Text ([string]$comment.body)
              if ([string]::IsNullOrWhiteSpace($commentBody)) { continue }
              $counter += 1
              $results += [pscustomobject]@{
                external_id = "t1_$($comment.id)"
                parent_id = "t3_$($post.id)"
                platform = "reddit"
                subreddit = $subreddit
                post_type = "comment"
                title = $postTitle
                body = $commentBody
                author_name = (Sanitize-Text ([string]$comment.author))
                score = [int]$comment.score
                comments_count = 0
                post_url = "https://www.reddit.com$($post.permalink)$($comment.id)"
                created_at_source = $commentCreatedUtc.ToString("o")
                combined_text = (Sanitize-Text "$postTitle $commentBody")
              }
            }
          } catch {
          }
        }

        $after = $listing.data.after
        if (-not $after) {
          break
        }
      }
    } catch {
      continue
    }
  }

  return $results
}

function Sync-FeedbackStore {
  Ensure-Store
  $store = Read-JsonFile -Path $StorePath
  $sources = Read-JsonFile -Path $SourcesPath
  $feedback = Get-RedditFeedback
  $today = (Get-Date).ToString("yyyy-MM-dd")
  $taxonomy = Get-TopicTaxonomy

  foreach ($item in $feedback) {
    if (($store.raw_posts | Where-Object { $_.external_id -eq $item.external_id }).Count -eq 0) {
      $store.raw_posts += $item
    }

    $topic = Get-Topic -Text $item.combined_text
    $sentiment = Get-Sentiment -Text $item.combined_text
    $impact = [Math]::Min(1, (($item.score + ($item.comments_count * 2)) / 500.0))
    $contentRiskLevel = Get-ContentRiskLevel -Text $item.combined_text

    $analysis = [pscustomobject]@{
      external_id = $item.external_id
      raw_post_id = $item.external_id
      topic_key = $topic
      sentiment = $sentiment
      impact = [Math]::Round($impact, 2)
      root_cause_summary = $((Get-TopicRootCause -TopicKey $topic))
      action_suggestion = ""
      risk_score = Get-RiskScoreFromLevel -RiskLevel $contentRiskLevel
      risk_level = $contentRiskLevel
      analyzed_at = (Get-Date).ToString("o")
    }

    $existingIndex = -1
    for ($i = 0; $i -lt $store.analyzed_feedback.Count; $i++) {
      if ($store.analyzed_feedback[$i].external_id -eq $item.external_id) {
        $existingIndex = $i
        break
      }
    }
    if ($existingIndex -ge 0) {
      $store.analyzed_feedback[$existingIndex] = $analysis
    } else {
      $store.analyzed_feedback += $analysis
    }
  }

  $store.meta.lastSyncAt = (Get-Date).ToString("o")
  $store.meta.game = $sources.game.name

  Write-JsonFile -Path $StorePath -Data $store
  return @{
    syncedAt = $store.meta.lastSyncAt
    ingested = $feedback.Count
    uniqueItems = $store.raw_posts.Count
  }
}

function Send-Json {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)]$Data,
    [int]$StatusCode = 200
  )
  try {
    $json = $Data | ConvertTo-Json -Depth 100
    if ([string]::IsNullOrWhiteSpace($json)) {
      $json = "[]"
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $Context.Response.StatusCode = $StatusCode
    $Context.Response.ContentType = "application/json; charset=utf-8"
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.AddHeader("Access-Control-Allow-Origin", "*")
    $Context.Response.AddHeader("Access-Control-Allow-Headers", "Content-Type")
    $Context.Response.AddHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Write-ServerLog "Send-Json failed: $($_.Exception.Message)"
  } finally {
    try { $Context.Response.OutputStream.Close() } catch {}
  }
}

function Send-File {
  param(
    [Parameter(Mandatory = $true)]$Context,
    [Parameter(Mandatory = $true)][string]$Path
  )
  if (-not (Test-Path $Path)) {
    Send-Json -Context $Context -Data @{ error = "Not found" } -StatusCode 404
    return
  }
  try {
    $ext = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()
    $contentType = switch ($ext) {
      ".html" { "text/html; charset=utf-8" }
      ".css" { "text/css; charset=utf-8" }
      ".js" { "application/javascript; charset=utf-8" }
      ".json" { "application/json; charset=utf-8" }
      ".md" { "text/plain; charset=utf-8" }
      default { "application/octet-stream" }
    }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    $Context.Response.StatusCode = 200
    $Context.Response.ContentType = $contentType
    $Context.Response.ContentLength64 = $bytes.Length
    $Context.Response.AddHeader("Access-Control-Allow-Origin", "*")
    $Context.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    Write-ServerLog "Send-File failed for $Path : $($_.Exception.Message)"
  } finally {
    try { $Context.Response.OutputStream.Close() } catch {}
  }
}

Ensure-Store
$store = Read-JsonFile -Path $StorePath
if (-not $store.meta.lastSyncAt) {
  try { Sync-FeedbackStore | Out-Null } catch {}
}
$sourcesConfig = Read-JsonFile -Path $SourcesPath
$autoSyncIntervalMinutes = if ($sourcesConfig.syncIntervalMinutes) { [int]$sourcesConfig.syncIntervalMinutes } else { 5 }
$nextAutoSyncAt = (Get-Date).AddMinutes($autoSyncIntervalMinutes)

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$listener.Start()
Write-Host "Game Feedback Monitor running at http://127.0.0.1:$Port/"
Write-ServerLog "Server started on port $Port"

$pendingContext = $listener.BeginGetContext($null, $null)
while ($listener.IsListening) {
  $context = $null
  try {
    if (-not $pendingContext.AsyncWaitHandle.WaitOne(300)) {
      if ((Get-Date) -ge $nextAutoSyncAt) {
        try {
          $syncResult = Sync-FeedbackStore
          Write-ServerLog "Auto sync completed: $($syncResult.syncedAt), ingested=$($syncResult.ingested), unique=$($syncResult.uniqueItems)"
        } catch {
          Write-ServerLog "Auto sync failed: $($_.Exception.Message)"
        } finally {
          $nextAutoSyncAt = (Get-Date).AddMinutes($autoSyncIntervalMinutes)
        }
      }
      continue
    }

    $context = $listener.EndGetContext($pendingContext)
    $pendingContext = $listener.BeginGetContext($null, $null)
    $request = $context.Request
    $path = $request.Url.AbsolutePath

    if ($request.HttpMethod -eq "OPTIONS") {
      Send-Json -Context $context -Data @{ ok = $true }
      continue
    }

    if ($path -eq "/api/admin/sync" -and $request.HttpMethod -eq "POST") {
      $result = Sync-FeedbackStore
      $nextAutoSyncAt = (Get-Date).AddMinutes($autoSyncIntervalMinutes)
      Send-Json -Context $context -Data @{ ok = $true; result = $result }
      continue
    }

    $localPath = if ($path -eq "/") { Join-Path $ProjectRoot "index.html" } else { Join-Path $ProjectRoot ($path.TrimStart('/')) }
    Send-File -Context $context -Path $localPath
  } catch {
    Write-ServerLog "Request loop failed: $($_.Exception.Message)"
    if ($context) {
      try {
        Send-Json -Context $context -Data @{ error = $_.Exception.Message } -StatusCode 500
      } catch {
        Write-ServerLog "Failed to send error response: $($_.Exception.Message)"
      }
    } else {
      Start-Sleep -Milliseconds 300
    }
  }
}
