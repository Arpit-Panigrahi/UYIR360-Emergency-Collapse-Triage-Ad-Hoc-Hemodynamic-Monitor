export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface SendMessageOptions {
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableWebPagePreview?: boolean;
  disableNotification?: boolean;
  config?: TelegramConfig;
}

export interface SendPhotoOptions {
  caption?: string;
  parseMode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disableNotification?: boolean;
  config?: TelegramConfig;
}

export const TELEGRAM_DEFAULT_CONFIG: TelegramConfig = {
  botToken: '8944094740:AAFXsedWmV6f9Ffrhths0qIO8O329ZwnJts',
  chatId: '7485486761',
};

// Default credentials initialized with user's Bot Token and Chat ID
let defaultTelegramConfig: TelegramConfig = { ...TELEGRAM_DEFAULT_CONFIG };

export function configureTelegram(config: TelegramConfig) {
  defaultTelegramConfig = config;
}

function resolveConfig(customConfig?: TelegramConfig): TelegramConfig {
  const config = customConfig || defaultTelegramConfig;
  if (!config || !config.botToken || !config.chatId) {
    throw new Error(
      'Telegram configuration missing. Provide botToken and chatId or call configureTelegram({ botToken, chatId }) first.'
    );
  }
  return config;
}

/**
 * Sends a text message to a Telegram chat via Bot API.
 */
export async function sendTelegramMessage(
  text: string,
  options?: SendMessageOptions
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { botToken, chatId } = resolveConfig(options?.config);
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

    // Ensure message does not exceed Telegram's 4096 character limit
    const safeText = text.length > 4000 ? text.substring(0, 3950) + '\n\n...[TRUNCATED]' : text;

    const payload = {
      chat_id: chatId,
      text: safeText,
      parse_mode: options?.parseMode ?? 'HTML',
      disable_web_page_preview: options?.disableWebPagePreview ?? true,
      disable_notification: options?.disableNotification ?? false,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      console.warn('[Telegram API Error]', data.description || response.statusText);
      return {
        success: false,
        error: data.description || `HTTP Error ${response.status}`,
      };
    }

    return { success: true, data: data.result };
  } catch (err: any) {
    console.error('[Telegram Send Error]', err);
    return {
      success: false,
      error: err?.message || 'Network error while sending Telegram message',
    };
  }
}

/**
 * Sends a photo to a Telegram chat (via URL or local file URI using FormData).
 */
export async function sendTelegramPhoto(
  photoUri: string,
  options?: SendPhotoOptions
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const { botToken, chatId } = resolveConfig(options?.config);
    const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;

    let body: any;
    let headers: Record<string, string> = {};

    if (photoUri.startsWith('http://') || photoUri.startsWith('https://')) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify({
        chat_id: chatId,
        photo: photoUri,
        caption: options?.caption,
        parse_mode: options?.parseMode ?? 'HTML',
        disable_notification: options?.disableNotification ?? false,
      });
    } else {
      const formData = new FormData();
      formData.append('chat_id', chatId);
      if (options?.caption) {
        formData.append('caption', options.caption);
        formData.append('parse_mode', options?.parseMode ?? 'HTML');
      }
      if (options?.disableNotification) {
        formData.append('disable_notification', 'true');
      }

      const filename = photoUri.split('/').pop() || 'photo.jpg';
      const fileType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

      formData.append('photo', {
        uri: photoUri,
        name: filename,
        type: fileType,
      } as any);

      body = formData;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      return {
        success: false,
        error: data.description || `HTTP Error ${response.status}`,
      };
    }

    return { success: true, data: data.result };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Failed to send photo to Telegram',
    };
  }
}

/**
 * Formats a comprehensive clinical & raw report containing ALL stats and metrics.
 */
export function formatFullMeasurementReport(stats: any, extra?: { durationSec?: number; rawStatus?: string }): string {
  const timestamp = new Date().toLocaleString();
  const c = stats?.cardio || {};
  const hTime = stats?.hrvTime || {};
  const hFreq = stats?.hrvFreq || {};
  const hNonLin = stats?.hrvNonlinear || {};
  const hemo = stats?.hemo || {};
  const resp = stats?.respiration;

  const lines = [
    `🏥 <b>UYIR360 / PULSEGUARD CLINICAL TELEMETRY</b>`,
    `📅 <b>Timestamp:</b> <code>${timestamp}</code>`,
    extra?.durationSec ? `⏱️ <b>Duration:</b> ${extra.durationSec}s` : null,
    extra?.rawStatus ? `📡 <b>Status:</b> ${extra.rawStatus}` : null,
    ``,
    `🫀 <b><u>CARDIOVASCULAR DYNAMICS</u></b>`,
    `• <b>Mean Heart Rate:</b> <code>${c.meanBpm != null ? Math.round(c.meanBpm) : '--'} BPM</code>`,
    `• <b>Median Heart Rate:</b> <code>${c.medBpm != null ? Math.round(c.medBpm) : '--'} BPM</code>`,
    `• <b>Spectral Peak (FFT):</b> <code>${c.spectralBpm != null ? Number(c.spectralBpm).toFixed(2) : '--'} BPM</code>`,
    `• <b>Min Heart Rate:</b> <code>${c.minBpm != null ? Math.round(c.minBpm) : '--'} BPM</code>`,
    `• <b>Max Heart Rate:</b> <code>${c.maxBpm != null ? Math.round(c.maxBpm) : '--'} BPM</code>`,
    `• <b>Total Detected Beats:</b> <code>${c.beats != null ? c.beats : '--'}</code>`,
    ``,
    `🫁 <b><u>HEMODYNAMICS & RESPIRATION</u></b>`,
    `• <b>SpO₂ Estimate:</b> <code>${hemo.spo2 != null ? Number(hemo.spo2).toFixed(1) : '--'}%</code>`,
    `• <b>Respiration Rate:</b> <code>${resp != null ? Number(resp).toFixed(1) : '--'} BrPM</code>`,
    `• <b>Perfusion Index (Green):</b> <code>${hemo.piG != null ? Number(hemo.piG).toFixed(3) : '--'}%</code>`,
    `• <b>Perfusion Index (Red):</b> <code>${hemo.piR != null ? Number(hemo.piR).toFixed(3) : '--'}%</code>`,
    `• <b>Pulse Crest Time:</b> <code>${hemo.crestTime != null ? Math.round(hemo.crestTime) : '--'} ms</code>`,
    ``,
    `⏱️ <b><u>HRV (TIME DOMAIN)</u></b>`,
    `• <b>Mean IBI:</b> <code>${hTime.meanIbi != null ? Math.round(hTime.meanIbi) : '--'} ms</code>`,
    `• <b>SDNN:</b> <code>${hTime.sdnn != null ? Number(hTime.sdnn).toFixed(2) : '--'} ms</code>`,
    `• <b>RMSSD:</b> <code>${hTime.rmssd != null ? Number(hTime.rmssd).toFixed(2) : '--'} ms</code>`,
    `• <b>pNN50:</b> <code>${hTime.pnn50 != null ? Number(hTime.pnn50).toFixed(2) : '--'}%</code>`,
    `• <b>pNN20:</b> <code>${hTime.pnn20 != null ? Number(hTime.pnn20).toFixed(2) : '--'}%</code>`,
    ``,
    `📊 <b><u>HRV (FREQUENCY DOMAIN)</u></b>`,
    `• <b>LF Power (0.04–0.15 Hz):</b> <code>${hFreq.lfPower != null ? (Number(hFreq.lfPower) * 1000).toFixed(2) : '--'} ms²</code>`,
    `• <b>HF Power (0.15–0.40 Hz):</b> <code>${hFreq.hfPower != null ? (Number(hFreq.hfPower) * 1000).toFixed(2) : '--'} ms²</code>`,
    `• <b>LF/HF Ratio:</b> <code>${hFreq.lfHfRatio != null ? Number(hFreq.lfHfRatio).toFixed(3) : '--'}</code>`,
    ``,
    `📈 <b><u>HRV (NON-LINEAR / POINCARÉ)</u></b>`,
    `• <b>SD1 (Short-term):</b> <code>${hNonLin.sd1 != null ? Number(hNonLin.sd1).toFixed(2) : '--'} ms</code>`,
    `• <b>SD2 (Long-term):</b> <code>${hNonLin.sd2 != null ? Number(hNonLin.sd2).toFixed(2) : '--'} ms</code>`,
    `• <b>SD1/SD2 Ratio:</b> <code>${
      hNonLin.sdRatio != null
        ? Number(hNonLin.sdRatio).toFixed(3)
        : hNonLin.sd1 && hNonLin.sd2
        ? (Number(hNonLin.sd1) / Number(hNonLin.sd2)).toFixed(3)
        : '--'
    }</code>`,
    ``,
    `📋 <b><u>COMPLETE RAW METRIC JSON</u></b>`,
    `<pre>${JSON.stringify(stats, null, 2)}</pre>`,
  ];

  return lines.filter(l => l !== null).join('\n');
}

/**
 * Convenience function to broadcast measurement results directly to Telegram.
 */
export async function pushMeasurementToTelegram(stats: any, extra?: { durationSec?: number; rawStatus?: string }) {
  const report = formatFullMeasurementReport(stats, extra);
  return await sendTelegramMessage(report);
}
