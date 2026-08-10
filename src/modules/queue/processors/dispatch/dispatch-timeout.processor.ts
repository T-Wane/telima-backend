import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject, forwardRef } from '@nestjs/common';
import { Job } from 'bullmq';
import { QueueNames } from '../../queue.constants';
import { DispatchTimeoutData } from '../../queue.service';
import { DispatchService } from '../../../dispatch/dispatch.service';

@Processor(QueueNames.DispatchTimeout)
export class DispatchTimeoutProcessor extends WorkerHost {
  private readonly logger = new Logger(DispatchTimeoutProcessor.name);

  constructor(
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatchService: DispatchService,
  ) {
    super();
  }

  async process(job: Job<DispatchTimeoutData>): Promise<void> {
    const { tripId, driverId } = job.data;
    this.logger.warn(`Dispatch timeout: trip=${tripId}, driver=${driverId}`);
    await this.dispatchService.handleDriverTimeout(tripId, driverId);
  }
}
