// Slackチャンネルの設定
const CHANNELS = [
  { id: 'CHANNEL_ID_1', name: 'general' },
  { id: 'CHANNEL_ID_2', name: 'random' },
];

const SLACK_TOKEN = 'YOUR_SLACK_TOKEN';
const GOOGLE_CHAT_WEBHOOK = 'YOUR_GOOGLE_CHAT_WEBHOOK_URL';

// メッセージが通知かどうかを判断
function isNotification(message) {
  if (!message) return false;
  
  const excludedSubtypes = ['channel_join', 'channel_leave', 'thread_broadcast'];
  if (message.subtype && excludedSubtypes.includes(message.subtype)) {
    return false;
  }

  return !!(message.subtype === 'bot_message' || message.bot_id || message.app_id);
}

// チャンネルの指定時間範囲のメッセージを取得
function getChannelMessages(channelId, oldest, latest) {
  const url = `https://slack.com/api/conversations.history?channel=${channelId}&oldest=${oldest}&latest=${latest}&limit=1000`;
  const options = {
    method: 'get',
    headers: {
      'Authorization': `Bearer ${SLACK_TOKEN}`
    }
  };
  
  try {
    const response = UrlFetchApp.fetch(url, options);
    const json = JSON.parse(response.getContentText());
    
    if (!json.ok) {
      console.error('Slack API error:', json.error);
      return [];
    }
    
    return json.messages || [];
  } catch (error) {
    console.error(`チャンネル ${channelId} の取得エラー:`, error);
    return [];
  }
}

// メッセージにリアクションがついているか確認
function hasReactions(message) {
  if (!message) return false;
  return Array.isArray(message.reactions) && message.reactions.length > 0;
}

// 全チャンネルの集計を行う
function collectChannelStats() {
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - (60 * 60);
  
  const stats = [];
  
  for (const channel of CHANNELS) {
    try {
      const messages = getChannelMessages(channel.id, oneHourAgo, now);
      const notificationCount = messages.filter(msg => 
        isNotification(msg) && !hasReactions(msg)
      ).length;
      
      stats.push({
        channelName: channel.name,
        messageCount: notificationCount,
        totalMessages: messages.length
      });
      
    } catch (error) {
      console.error(`チャンネル ${channel.name} の処理中にエラー:`, error);
      stats.push({
        channelName: channel.name,
        messageCount: 0,
        totalMessages: 0,
        error: error.message
      });
    }
  }
  
  return stats;
}

// Google Chatにメッセージを投稿
function postToGoogleChat(stats) {
  const now = new Date();
  const timeStr = now.toLocaleString('ja-JP');
  
  // カードスタイルのメッセージを作成
  const message = {
    cards: [{
      header: {
        title: "Slack通知集計レポート",
        subtitle: `集計時間: ${timeStr}`
      },
      sections: [{
        widgets: [{
          textParagraph: {
            text: "過去1時間の未対応通知数"
          }
        }]
      }, {
        widgets: [{
          keyValue: {
            topLabel: "チャンネル別集計",
            content: stats.map(stat => 
              `${stat.channelName}: ${stat.messageCount}件 / 総数${stat.totalMessages}件`
            ).join('\n')
          }
        }]
      }]
    }]
  };

  // エラーがあった場合はセクションを追加
  const errorsExist = stats.some(stat => stat.error);
  if (errorsExist) {
    message.cards[0].sections.push({
      widgets: [{
        textParagraph: {
          text: "⚠️ エラー情報:\n" + 
                stats.filter(stat => stat.error)
                    .map(stat => `${stat.channelName}: ${stat.error}`)
                    .join('\n')
        }
      }]
    });
  }

  // Google Chatに投稿
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(message)
  };

  try {
    UrlFetchApp.fetch(GOOGLE_CHAT_WEBHOOK, options);
    console.log('Google Chatへの投稿完了');
  } catch (error) {
    console.error('Google Chatへの投稿エラー:', error);
  }
}

// メイン実行関数
function main() {
  try {
    const stats = collectChannelStats();
    if (stats.length > 0) {
      postToGoogleChat(stats);
      console.log('集計完了:', stats);
    } else {
      console.log('集計対象のデータがありませんでした');
    }
  } catch (error) {
    console.error('実行エラー:', error);
  }
}

// トリガー設定
function setHourlyTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyHours(1)
    .create();
}
