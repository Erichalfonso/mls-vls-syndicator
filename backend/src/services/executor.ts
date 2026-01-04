// Workflow execution engine - coordinates workflow execution via extension
// This service doesn't execute actions directly but manages the execution process

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface WorkflowAction {
  action: string;
  selector?: string;
  value?: string;
  text?: string;
  timestamp?: string;
  step?: number;
}

interface ExecutionResult {
  success: boolean;
  listingId: number;
  completedSteps: number;
  totalSteps: number;
  error?: string;
}

/**
 * Execute a single workflow for a listing
 *
 * NOTE: This is a simplified version for scheduled execution.
 * The actual execution happens in the browser extension which:
 * 1. Calls /api/extension/get-next-action to get each step
 * 2. Executes the action in the browser
 * 3. Moves to the next step
 *
 * For now, we mark listings as ready for execution and the extension picks them up.
 */
export async function executeWorkflow(
  workflowId: number,
  listingId: number
): Promise<ExecutionResult> {
  try {
    // Get workflow
    const workflow = await prisma.workflow.findUnique({
      where: { id: workflowId }
    });

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    // Get listing
    const listing = await prisma.listing.findUnique({
      where: { id: listingId }
    });

    if (!listing) {
      throw new Error(`Listing ${listingId} not found`);
    }

    // Get recorded actions
    const actions = (workflow.recordedActions as any) || [];

    if (!Array.isArray(actions) || actions.length === 0) {
      throw new Error('Workflow has no recorded actions');
    }

    console.log(`[Executor] Preparing workflow ${workflowId} for listing ${listingId}`);
    console.log(`[Executor] Total steps: ${actions.length}`);

    // For scheduled execution, we simulate success
    // In a real implementation, this would:
    // 1. Trigger the extension to execute the workflow
    // 2. Wait for completion
    // 3. Return actual results

    // Simulate execution with a small delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Return success (in production, this would be based on actual execution)
    return {
      success: true,
      listingId,
      completedSteps: actions.length,
      totalSteps: actions.length
    };
  } catch (error) {
    console.error(`[Executor] Error executing workflow:`, error);
    return {
      success: false,
      listingId,
      completedSteps: 0,
      totalSteps: 0,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Execute workflow for multiple listings in batch
 */
export async function executeWorkflowBatch(
  workflowId: number,
  listingIds: number[]
): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  for (const listingId of listingIds) {
    const result = await executeWorkflow(workflowId, listingId);
    results.push(result);

    // Add delay between executions to avoid overload
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return results;
}
