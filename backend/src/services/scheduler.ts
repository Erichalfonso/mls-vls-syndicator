// Workflow scheduler - runs scheduled workflows automatically

import * as cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { executeWorkflow } from './executor';

const prisma = new PrismaClient();

// Track running jobs
const scheduledJobs = new Map<number, any>();

/**
 * Check if current time is within workflow schedule
 */
function isWithinSchedule(workflow: any): boolean {
  if (!workflow.isScheduled) return false;
  if (!workflow.scheduleStartTime || !workflow.scheduleEndTime) return false;

  const now = new Date();
  const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
  const currentTime = now.toTimeString().substring(0, 5); // "HH:MM"

  // Check if today is a scheduled day
  const scheduleDays = workflow.scheduleDays || [];
  if (!scheduleDays.includes(currentDay)) {
    return false;
  }

  // Check if current time is within start/end time
  const start = workflow.scheduleStartTime;
  const end = workflow.scheduleEndTime;

  if (currentTime >= start && currentTime <= end) {
    return true;
  }

  return false;
}

/**
 * Run a workflow automatically
 */
async function runScheduledWorkflow(workflowId: number) {
  try {
    console.log(`[Scheduler] Running workflow ${workflowId}`);

    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId },
      include: { user: true }
    });

    if (!workflow) {
      console.error(`[Scheduler] Workflow ${workflowId} not found`);
      return;
    }

    // Check if workflow is ready
    if (workflow.status !== 'ready' && workflow.status !== 'active') {
      console.log(`[Scheduler] Workflow ${workflowId} not ready (status: ${workflow.status})`);
      return;
    }

    // Get pending listings for this workflow
    const listings = await prisma.listing.findMany({
      where: {
        userId: workflow.userId,
        uploadStatus: 'pending'
      },
      take: 10 // Process 10 listings per run to avoid overload
    });

    if (listings.length === 0) {
      console.log(`[Scheduler] No pending listings for workflow ${workflowId}`);
      return;
    }

    console.log(`[Scheduler] Found ${listings.length} pending listings`);

    // Create automation run
    const automationRun = await prisma.automationRun.create({
      data: {
        userId: workflow.userId,
        workflowId: workflow.id,
        runType: 'deterministic',
        status: 'running',
        totalListings: listings.length,
        successfulListings: 0,
        failedListings: 0,
        startedAt: new Date()
      }
    });

    console.log(`[Scheduler] Created automation run ${automationRun.id}`);

    // Update workflow last run time
    await prisma.workflow.update({
      where: { id: workflowId },
      data: { lastScheduledRun: new Date() }
    });

    // Process each listing
    let successful = 0;
    let failed = 0;

    for (const listing of listings) {
      try {
        // Mark as processing
        await prisma.listing.update({
          where: { id: listing.id },
          data: { uploadStatus: 'processing' }
        });

        console.log(`[Scheduler] Processing listing ${listing.id} - ${listing.address}`);

        // Execute workflow using execution engine
        const result = await executeWorkflow(workflowId, listing.id);

        if (result.success) {
          // Mark as completed
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              uploadStatus: 'completed',
              uploadedAt: new Date(),
              uploadResult: {
                success: true,
                message: 'Scheduled upload completed',
                completedSteps: result.completedSteps,
                totalSteps: result.totalSteps
              }
            }
          });

          successful++;
        } else {
          // Mark as failed
          await prisma.listing.update({
            where: { id: listing.id },
            data: {
              uploadStatus: 'failed',
              uploadResult: {
                success: false,
                error: result.error || 'Workflow execution failed',
                completedSteps: result.completedSteps,
                totalSteps: result.totalSteps
              }
            }
          });

          failed++;
        }
      } catch (error) {
        console.error(`[Scheduler] Failed to process listing ${listing.id}:`, error);

        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            uploadStatus: 'failed',
            uploadResult: {
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        });

        failed++;
      }
    }

    // Update automation run
    await prisma.automationRun.update({
      where: { id: automationRun.id },
      data: {
        status: failed > 0 && successful === 0 ? 'failed' : 'completed',
        successfulListings: successful,
        failedListings: failed,
        completedAt: new Date()
      }
    });

    console.log(`[Scheduler] Completed workflow ${workflowId}: ${successful} successful, ${failed} failed`);
  } catch (error) {
    console.error(`[Scheduler] Error running workflow ${workflowId}:`, error);
  }
}

/**
 * Check all workflows and run scheduled ones
 */
async function checkScheduledWorkflows() {
  try {
    const workflows = await prisma.workflow.findMany({
      where: {
        isScheduled: true,
        status: {
          in: ['ready', 'active']
        }
      }
    });

    for (const workflow of workflows) {
      if (isWithinSchedule(workflow)) {
        // Check if we already ran recently (prevent duplicate runs)
        if (workflow.lastScheduledRun) {
          const minutesSinceLastRun = (Date.now() - workflow.lastScheduledRun.getTime()) / 1000 / 60;
          if (minutesSinceLastRun < 30) {
            // Don't run if we ran less than 30 minutes ago
            continue;
          }
        }

        await runScheduledWorkflow(workflow.id);
      }
    }
  } catch (error) {
    console.error('[Scheduler] Error checking workflows:', error);
  }
}

/**
 * Start the scheduler
 */
export function startScheduler() {
  console.log('[Scheduler] Starting workflow scheduler...');

  // Run every minute to check for scheduled workflows
  const task = cron.schedule('* * * * *', async () => {
    await checkScheduledWorkflows();
  });

  task.start();
  console.log('[Scheduler] Scheduler started - checking every minute');

  return task;
}

/**
 * Stop the scheduler
 */
export function stopScheduler(task: any) {
  task.stop();
  console.log('[Scheduler] Scheduler stopped');
}
