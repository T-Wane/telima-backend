import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueNames, DispatchTimeoutJob } from './queue.constants';

export interface DispatchTimeoutData {
  tripId: string;
  driverId: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QueueNames.DispatchTimeout)
    private readonly dispatchTimeoutQueue: Queue,
  ) {}

  async scheduleDispatchTimeout(data: DispatchTimeoutData, delayMs: number): Promise<string> {
    const job = await this.dispatchTimeoutQueue.add(DispatchTimeoutJob.name, data, {
      delay: delayMs,
      removeOnComplete: true,
      removeOnFail: 100,
    });
    this.logger.debug(
      `Scheduled dispatch timeout for trip ${data.tripId}, driver ${data.driverId}, job ${job.id}`,
    );
    return job.id ?? '';
  }

  async cancelDispatchTimeout(jobId: string): Promise<void> {
    const job = await this.dispatchTimeoutQueue.getJob(jobId);
    if (job) {
      await job.remove();
      this.logger.debug(`Cancelled dispatch timeout job ${jobId}`);
    }
  }
}
