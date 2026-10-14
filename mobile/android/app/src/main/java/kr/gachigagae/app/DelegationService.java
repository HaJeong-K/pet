package kr.gachigagae.app;


import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;

import java.util.Locale;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;


public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    /** 알림 아이콘 색 — 로고의 갈색(#8B5E3C). 알림창을 내렸을 때 작은 아이콘이 이 색으로 표시됩니다. */
    private static final int NOTIFICATION_COLOR = 0xFF8B5E3C;

    /**
     * 사장님 "새 예약" 알림 전용 채널 — 다른 앱과 구별되는 멍멍 소리(res/raw/ggk_bark.wav)로 울립니다.
     * 휴대폰의 설정 > 알림 > 같이가개 > "새 예약 알림"에서 소리를 바꾸거나 끌 수 있습니다.
     */
    private static final String ORDER_CHANNEL_NAME = "새 예약 알림";
    /** 사이트가 새 예약 알림에 붙이는 꼬리표 앞머리(src/lib/server/ownerPush.ts의 ORDER_TAG_PREFIX와 같아야 합니다) */
    private static final String ORDER_TAG_PREFIX = "ggk-order";

    private Uri barkSound() {
        return Uri.parse("android.resource://" + getPackageName() + "/" + R.raw.ggk_bark);
    }

    /** 새 예약 알림인지 — 꼬리표나 제목("멍멍!"으로 시작)으로 알아봅니다. */
    private static boolean isOrderNotification(String platformTag, Notification notification) {
        if (platformTag != null && platformTag.contains(ORDER_TAG_PREFIX)) return true;
        CharSequence title = notification.extras != null ? notification.extras.getCharSequence(Notification.EXTRA_TITLE) : null;
        return title != null && title.toString().startsWith("멍멍");
    }

    /**
     * 전용 채널을 소리와 함께 미리 만들어 둡니다. 채널 번호는 라이브러리(TrustedWebActivityService)가 이름으로 만드는 것과
     * 같은 규칙이어야, 라이브러리가 같은 채널을 다시 만들려 할 때 우리가 정한 소리가 그대로 남습니다.
     */
    private void ensureOrderChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        String channelId = ORDER_CHANNEL_NAME.toLowerCase(Locale.ROOT).replace(' ', '_') + "_channel_id";
        if (manager == null || manager.getNotificationChannel(channelId) != null) return;
        NotificationChannel channel = new NotificationChannel(channelId, ORDER_CHANNEL_NAME, NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("손님이 예약을 넣으면 멍멍 소리로 알려 드려요.");
        channel.setSound(barkSound(), new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build());
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] {0, 180, 90, 220});
        manager.createNotificationChannel(channel);
    }

    @Override
    public void onCreate() {
        super.onCreate();


            registerExtraCommandHandler(new LocationDelegationExtraCommandHandler());

    }

    // 사이트가 보낸 알림을 앱이 대신 띄울 때 아이콘 색을 입힙니다.
    // (상단바 자체의 아이콘 색은 안드로이드가 정합니다 — 어두운 바탕에서는 흰색, 밝은 바탕에서는 검은색. 앱이 바꿀 수 없습니다.)
    @Override
    public boolean onNotifyNotificationWithChannel(String platformTag, int platformId,
            Notification notification, String channelName) {
        notification.color = NOTIFICATION_COLOR;
        // 새 예약 알림은 멍멍 소리가 나는 전용 채널로 보냅니다(그 밖의 알림은 예전 그대로).
        if (isOrderNotification(platformTag, notification)) {
            ensureOrderChannel();
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) notification.sound = barkSound();
            return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, ORDER_CHANNEL_NAME);
        }
        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
    }
}
