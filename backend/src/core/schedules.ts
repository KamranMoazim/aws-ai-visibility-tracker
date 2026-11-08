import {
  ConflictException,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  ResourceNotFoundException,
  SchedulerClient,
  UpdateScheduleCommand,
  type CreateScheduleCommandInput,
} from '@aws-sdk/client-scheduler';

export const SCHEDULE_GROUP = 'answershare';
export const WEEKLY_EXPRESSION = 'cron(0 6 ? * MON *)';

const scheduler = new SchedulerClient({});

export const scheduleName = (workspaceId: string) => `ws-${workspaceId}`;

export async function upsertWeeklySchedule(workspaceId: string): Promise<void> {
  const input: CreateScheduleCommandInput = {
    Name: scheduleName(workspaceId),
    GroupName: SCHEDULE_GROUP,
    ScheduleExpression: WEEKLY_EXPRESSION,
    ScheduleExpressionTimezone: 'UTC',
    FlexibleTimeWindow: { Mode: 'FLEXIBLE', MaximumWindowInMinutes: 60 },
    Target: {
      Arn: process.env.STATE_MACHINE_ARN!,
      RoleArn: process.env.SCHEDULER_ROLE_ARN!,
      Input: JSON.stringify({ workspaceId, trigger: 'schedule' }),
      RetryPolicy: { MaximumRetryAttempts: 2 },
    },
  };
  try {
    await scheduler.send(new CreateScheduleCommand(input));
  } catch (error) {
    if (!(error instanceof ConflictException)) {
      throw error;
    }
    await scheduler.send(new UpdateScheduleCommand(input));
  }
}

export async function deleteSchedule(workspaceId: string): Promise<void> {
  try {
    await scheduler.send(
      new DeleteScheduleCommand({ Name: scheduleName(workspaceId), GroupName: SCHEDULE_GROUP }),
    );
  } catch (error) {
    if (!(error instanceof ResourceNotFoundException)) {
      throw error;
    }
  }
}
