package kr.gachigagae.app;


import android.app.Notification;

import com.google.androidbrowserhelper.locationdelegation.LocationDelegationExtraCommandHandler;


public class DelegationService extends
        com.google.androidbrowserhelper.trusted.DelegationService {

    /** 알림 아이콘 색 — 로고의 갈색(#8B5E3C). 알림창을 내렸을 때 작은 아이콘이 이 색으로 표시됩니다. */
    private static final int NOTIFICATION_COLOR = 0xFF8B5E3C;

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
        return super.onNotifyNotificationWithChannel(platformTag, platformId, notification, channelName);
    }
}
