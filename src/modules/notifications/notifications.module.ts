import { Module } from '@nestjs/common';
import { NotificationHandler } from './notification.handler';
import { PushProviderModule } from '../providers/push/push-provider.module';

@Module({
  imports: [PushProviderModule],
  providers: [NotificationHandler],
})
export class NotificationsModule {}
