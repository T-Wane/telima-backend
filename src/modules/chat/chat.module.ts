import { Module, forwardRef } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { StorageModule } from '../storage/storage.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [StorageModule, forwardRef(() => EventsModule)],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
