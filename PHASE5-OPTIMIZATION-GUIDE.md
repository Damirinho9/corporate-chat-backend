# 📈 Phase 5: Continuous Optimization Guide

## Overview

Phase 5 provides ongoing monitoring, analytics, and optimization tools to continuously improve your support system.

## Features

### 1. 📊 Automated Metrics Reporting
- **Weekly Reports**: Sent every Monday at 9 AM
- **Monthly Reports**: Sent on the 1st of each month at 9 AM
- **Custom Reports**: Generate on-demand

### 2. 📚 KB Analytics
- Article performance tracking
- Search effectiveness monitoring
- Content gap identification
- Outdated article detection
- Article suggestions based on tickets

### 3. 🤖 Chatbot Training Analytics
- Unresolved conversation tracking
- Intent confidence analysis
- Unhandled query identification
- Training data quality assessment
- Suggested new intents

## API Endpoints

### Metrics Reporting

```bash
# Get report history
GET /api/phase5/metrics/reports?type=weekly&limit=10

# Generate custom report
POST /api/phase5/metrics/generate
{
  "period": 30,
  "emails": ["admin@example.com"]
}
```

### KB Analytics

```bash
# Article performance
GET /api/phase5/kb/performance?period=30&sortBy=views

# Search analytics
GET /api/phase5/kb/search-analytics?period=30

# Content gaps
GET /api/phase5/kb/content-gaps?period=30

# Outdated articles
GET /api/phase5/kb/outdated?daysOld=90

# Dashboard summary
GET /api/phase5/kb/dashboard?period=30

# Article suggestions
GET /api/phase5/kb/suggestions?period=30

# Track article view (from frontend)
POST /api/phase5/kb/track-view
{
  "articleId": 123,
  "searchQuery": "how to reset password"
}

# Track search query
POST /api/phase5/kb/track-search
{
  "query": "password reset",
  "resultsCount": 5
}
```

### Chatbot Training Analytics

```bash
# Unresolved conversations
GET /api/phase5/chatbot/unresolved?period=30

# Intent analysis
GET /api/phase5/chatbot/intent-analysis?period=30

# Unhandled queries
GET /api/phase5/chatbot/unhandled-queries?period=30

# Effectiveness metrics
GET /api/phase5/chatbot/effectiveness?period=30

# Training data quality
GET /api/phase5/chatbot/training-quality

# Suggested new intents
GET /api/phase5/chatbot/suggested-intents?period=30

# Dashboard summary
GET /api/phase5/chatbot/dashboard?period=30

# Export training data
GET /api/phase5/chatbot/export-training/:intent
```

## Configuration

### Enable Automated Reporting

Add to `.env` or `ecosystem.config.js`:

```env
METRICS_REPORTING_ENABLED=true
APP_URL=http://localhost:3000
```

### Email Configuration

Ensure email service is configured for sending reports:

```env
EMAIL_SERVICE=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Database Tables

Phase 5 adds the following tables:

- `support_metrics_reports` - Stores generated reports
- `kb_article_views` - Tracks article views
- `kb_search_queries` - Tracks search queries
- `kb_article_ratings` - Stores article ratings

Run the schema migration:

```bash
psql -U postgres -d corporate_chat -f database/schema.sql
```

## Usage Examples

### 1. Monitor KB Performance

```javascript
// Get top performing articles
const response = await fetch('/api/phase5/kb/performance?period=30&limit=10', {
  headers: {
    'Authorization': `Bearer ${adminToken}`
  }
});

const { articles } = await response.json();

// articles contains:
// - title, category
// - totalViews, recentViews
// - avgRating, helpfulnessPercentage
// - uniqueVisitors
```

### 2. Identify Content Gaps

```javascript
// Find topics needing KB articles
const response = await fetch('/api/phase5/kb/content-gaps?period=30', {
  headers: {
    'Authorization': `Bearer ${adminToken}`
  }
});

const { searchGaps, ticketGaps } = await response.json();

// searchGaps: frequent searches with no results
// ticketGaps: common ticket topics not in KB
```

### 3. Review Unresolved Chatbot Conversations

```javascript
// Get conversations that need review
const response = await fetch('/api/phase5/chatbot/unresolved?period=30', {
  headers: {
    'Authorization': `Bearer ${adminToken}`
  }
});

const { conversations } = await response.json();

// Each conversation includes:
// - messageCount, userMessages, botMessages
// - hasUnknownIntent, wasEscalated
// - intents used in conversation
```

### 4. Generate Custom Report

```javascript
// Generate report for last 7 days
const response = await fetch('/api/phase5/metrics/generate', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${adminToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    period: 7,
    emails: ['manager@company.com', 'ceo@company.com']
  })
});

const { reportId } = await response.json();
```

## Metrics Explained

### KB Metrics

- **Views**: Number of times article was opened
- **Unique Visitors**: Number of different users who viewed
- **Avg Rating**: Average rating (1-5 stars)
- **Helpfulness %**: Percentage of ratings 4+ stars
- **Search Success Rate**: Percentage of searches with results

### Chatbot Metrics

- **Resolution Rate**: % of conversations not escalated to human
- **Avg Confidence**: Average intent detection confidence
- **Escalation Rate**: % of conversations escalated
- **Unknown Intent Rate**: % of messages with unknown intent

## Optimization Workflow

### Weekly Tasks

1. **Review Weekly Report** (Monday morning)
   - Check SLA compliance
   - Review CSAT scores
   - Identify trends

2. **KB Maintenance**
   - Review top search misses
   - Update outdated articles
   - Create articles for content gaps

3. **Chatbot Training**
   - Review unresolved conversations
   - Add training data for low-confidence intents
   - Test new intents

### Monthly Tasks

1. **Deep Analytics Review**
   - Analyze monthly trends
   - Review agent performance
   - Evaluate automation effectiveness

2. **Content Strategy**
   - Plan new KB articles
   - Archive unused articles
   - Update categories

3. **Chatbot Improvement**
   - Create new intents from unhandled queries
   - Improve training data quality
   - A/B test response variations

### Quarterly Tasks

1. **ROI Analysis**
   - Calculate cost per ticket
   - Measure automation savings
   - Evaluate self-service adoption

2. **Process Optimization**
   - Review and update workflows
   - Optimize SLA targets
   - Refine auto-assignment rules

3. **Strategic Planning**
   - Set new targets
   - Plan feature enhancements
   - Budget for next quarter

## Best Practices

### 1. KB Optimization

- ✅ Aim for 70%+ search success rate
- ✅ Keep articles updated (< 90 days old)
- ✅ Target 4.0+ average rating
- ✅ Create articles for queries with 5+ searches/month
- ✅ Remove articles with < 10 views in 6 months

### 2. Chatbot Training

- ✅ Maintain 80%+ resolution rate
- ✅ Target 0.7+ average intent confidence
- ✅ Provide 20+ training examples per intent
- ✅ Review unresolved conversations weekly
- ✅ Create new intents for queries with 5+ occurrences

### 3. Metrics Monitoring

- ✅ Monitor SLA compliance weekly
- ✅ Track CSAT trends monthly
- ✅ Review agent performance monthly
- ✅ Analyze ticket volume trends
- ✅ Set automated alerts for anomalies

## Troubleshooting

### Reports Not Sending

1. Check `METRICS_REPORTING_ENABLED=true`
2. Verify email configuration
3. Check admin users exist in database
4. Review server logs for errors

### Low KB Search Success Rate

1. Review search misses in analytics
2. Create articles for common searches
3. Improve article titles/keywords
4. Add synonyms to search

### Low Chatbot Resolution Rate

1. Review unresolved conversations
2. Identify missing intents
3. Improve training data quality
4. Add fallback responses

## Integration

### Frontend Integration

Track KB article views:

```javascript
// When user opens article
fetch('/api/phase5/kb/track-view', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    articleId: articleId,
    searchQuery: searchQuery // if came from search
  })
});

// When user searches KB
fetch('/api/phase5/kb/track-search', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: searchQuery,
    resultsCount: results.length
  })
});
```

## Next Steps

1. Enable metrics reporting
2. Integrate tracking in frontend
3. Review first weekly report
4. Set up optimization workflow
5. Train team on using analytics

## Support

For issues or questions about Phase 5:
- Review server logs: `pm2 logs corporate-chat`
- Check database connections
- Verify all Phase 5 tables exist
- Test API endpoints with admin token

---

**Phase 5 completes the continuous optimization cycle for your support system!** 🎯
