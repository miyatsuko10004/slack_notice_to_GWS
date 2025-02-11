// チャンネルのリスト
const CHANNELS = [
  { id: 'CHANNEL_ID_1', name: 'general' },
  { id: 'CHANNEL_ID_2', name: 'random' },
];

const SLACK_TOKEN = 'YOUR_SLACK_TOKEN';
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';

// メッセージが通知かどうかを判断
function isNotification(message) {
  // 通知の特徴を判定
  // - botによる投稿
  // - アプリによる投稿
  // - 特定のサブタイプ（join, leave, thread_broadcast など）
  return (
    (message.subtype === 'bot_message' || 
     message.bot_id || 
     message.app_id) &&
    !message.subtype?.match(/^(channel_join|channel_leave|thread_broadcast)$/)
  );
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
    return json.messages || [];
  } catch (error) {
    console.error(`チャンネル ${channelId} の取得エラー:`, error);
    return [];
  }
}

// メッセージにリアクションがついているか確認
function hasReactions(message) {
  return message.reactions && message.reactions.length > 0;
}

// 全チャンネルの集計を行う
function collectChannelStats() {
  // 1時間前からの時間範囲を設定
  const now = Math.floor(Date.now() / 1000);
  const oneHourAgo = now - (60 * 60);
  
  const stats = CHANNELS.map(channel => {
    const messages = getChannelMessages(channel.id, oneHourAgo, now);
    
    // 通知メッセージかつリアクションのないメッセージをカウント
    const notificationCount = messages.filter(msg => 
      isNotification(msg) && !hasReactions(msg)
    ).length;
    
    return {
      channelName: channel.name,
      messageCount: notificationCount,
      timestamp: new Date(),
      totalMessages: messages.length, // 総メッセージ数（参考用）
    };
  });
  
  return stats;
}

// Spreadsheetに記録
function writeToSpreadsheet(stats) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('未対応通知集計') || ss.insertSheet('未対応通知集計');
  
  // ヘッダーがなければ追加
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      'タイムスタンプ',
      'チャンネル名',
      'リアクションなし通知数',
      '総メッセージ数'
    ]);
  }
  
  // データを追加
  stats.forEach(stat => {
    sheet.appendRow([
      stat.timestamp,
      stat.channelName,
      stat.messageCount,
      stat.totalMessages
    ]);
  });
  
  // 集計グラフ用のピボットテーブルを作成/更新
  createOrUpdatePivotTable(ss, sheet.getSheetName());
}

// ピボットテーブルとグラフの作成
function createOrUpdatePivotTable(ss, sourceSheetName) {
  const pivotSheetName = '時間別未対応通知集計';
  let pivotSheet = ss.getSheetByName(pivotSheetName);
  
  if (!pivotSheet) {
    pivotSheet = ss.insertSheet(pivotSheetName);
    
    const range = ss.getSheetByName(sourceSheetName).getDataRange();
    const pivotTable = pivotSheet.getRange('A1').createPivotTable(range);
    
    pivotTable.addRowGroup(1); // タイムスタンプ
    pivotTable.addColumnGroup(2); // チャンネル名
    pivotTable.addPivotValue(3, SpreadsheetApp.PivotTableSummarizeFunction.SUM); // リアクションなし通知数
  }
}

// メイン実行関数
function main() {
  const stats = collectChannelStats();
  writeToSpreadsheet(stats);
}

// トリガー設定
function setHourlyTrigger() {
  // 既存のトリガーを削除
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));
  
  // 1時間ごとのトリガーを設定
  ScriptApp.newTrigger('main')
    .timeBased()
    .everyHours(1)
    .create();
}
