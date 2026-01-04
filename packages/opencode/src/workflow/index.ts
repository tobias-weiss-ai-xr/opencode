import { z } from "zod"
import { Provider } from "@/provider/provider"
import { AI } from "@/ai"
import { Log } from "../util/log"

const log = Log.create({ service: "workflow" })

export interface WorkflowNode {
  name: string
  type: "tool" | "llm" | "subgraph"
  handler: (input: any) => Promise<any>
  description?: string
}

export interface WorkflowEdge {
  from: string
  to: string
  condition?: (state: any) => boolean
}

export interface WorkflowGraph {
  nodes: Map<string, WorkflowNode>
  edges: WorkflowEdge[]
  entryPoint: string
  endPoints: string[]
  state: any
}

export const WorkflowInput = z
  .object({
    task: z.string().describe("Task description or prompt"),
    context: z.string().optional().describe("Additional context about task"),
    model: z.string().optional().describe("Model to use for LLM nodes"),
    max_steps: z.number().optional().describe("Maximum number of steps"),
  })
  .describe("Workflow input parameters")

export type WorkflowInputType = z.infer<typeof WorkflowInput>

export const WorkflowResult = z
  .object({
    final_output: z.any().optional().describe("Final workflow output"),
    steps: z
      .array(
        z.object({
          node: z.string().describe("Node name"),
          output: z.any().describe("Node output"),
          duration: z.number().describe("Step duration in ms"),
        })
      )
      .describe("All steps executed"),
    state: z.record(z.string(), z.any()).optional().describe("Final workflow state"),
    status: z.enum(["success", "error", "timeout"]).describe("Workflow execution status"),
    error: z.string().optional().describe("Error message if failed"),
  })
  .describe("Workflow execution result")

export type WorkflowResultType = z.infer<typeof WorkflowResult>

export class WorkflowEngine {
  private graphs: Map<string, WorkflowGraph> = new Map()

  constructor() {
    this.registerPredefinedWorkflows()
  }

  registerPredefinedWorkflows(): void {
    // Planning Workflow
    this.registerWorkflow("planning", this.buildPlanningWorkflow())

    // Analysis Workflow
    this.registerWorkflow("analysis", this.buildAnalysisWorkflow())

    // Code Review Workflow
    this.registerWorkflow("code-review", this.buildCodeReviewWorkflow())

    // Test Generation Workflow
    this.registerWorkflow("test-generation", this.buildTestGenerationWorkflow())

    // Debugging Workflow
    this.registerWorkflow("debugging", this.buildDebuggingWorkflow())
  }

  registerWorkflow(name: string, graph: WorkflowGraph): void {
    this.graphs.set(name, graph)
    log.debug(`Registered workflow`, { name, nodes: graph.nodes.size })
  }

  getWorkflow(name: string): WorkflowGraph | undefined {
    return this.graphs.get(name)
  }

  async execute(name: string, input: WorkflowInputType): Promise<WorkflowResultType> {
    const graph = this.getWorkflow(name)
    if (!graph) {
      throw new Error(`Workflow "${name}" not found`)
    }

    log.info(`Executing workflow`, { name, input: input.task })

    const startTime = Date.now()
    const steps: any[] = []
    const state: any = { ...graph.state, ...input }
    let currentNode = graph.entryPoint
    let stepCount = 0
    const maxSteps = input.max_steps || 50

    try {
      while (currentNode) {
        if (stepCount >= maxSteps) {
          throw new Error(`Workflow exceeded maximum steps (${maxSteps})`)
        }

        const node = graph.nodes.get(currentNode)
        if (!node) {
          throw new Error(`Node "${currentNode}" not found in workflow`)
        }

        const stepStartTime = Date.now()

        const nodeInput = this.prepareNodeInput(node, state)
        const nodeOutput = await node.handler(nodeInput)

        steps.push({
          node: currentNode,
          output: nodeOutput,
          duration: Date.now() - stepStartTime,
        })

        this.updateState(state, node, nodeOutput)

        const nextNode = this.findNextNode(graph, currentNode, state)
        currentNode = nextNode
        stepCount++
      }

      const finalOutput = state.final_output

      return {
        final_output: finalOutput,
        steps,
        state,
        status: "success",
      }
    } catch (error) {
      log.error(`Workflow execution failed`, {
        name,
        error: String(error),
        steps: stepCount,
      })

      return {
        steps,
        state,
        status: "error",
        error: String(error),
      }
    } finally {
      const duration = Date.now() - startTime
      log.info(`Workflow execution completed`, {
        name,
        duration,
        steps: stepCount,
        status: steps.some(s => s.duration > 0) ? "success" : "error",
      })
    }
  }

  private prepareNodeInput(node: WorkflowNode, state: any): any {
    if (node.type === "llm") {
      return {
        task: state.task,
        context: state.context,
        ...state,
      }
    }
    return state
  }

  private updateState(state: any, node: WorkflowNode, output: any): void {
    if (typeof output === "object" && output !== null) {
      Object.assign(state, output)
    }

    if (node.name && !state[`output_${node.name}`]) {
      state[`output_${node.name}`] = output
    }
  }

  private findNextNode(graph: WorkflowGraph, currentNode: string, state: any): string | null {
    const outgoingEdges = graph.edges.filter(e => e.from === currentNode)

    for (const edge of outgoingEdges) {
      if (!edge.condition || edge.condition(state)) {
        return edge.to
      }
    }

    if (graph.endPoints.includes(currentNode)) {
      return null
    }

    throw new Error(`No valid next node found from "${currentNode}"`)
  }

  // Predefined Workflows

  private buildPlanningWorkflow(): WorkflowGraph {
    const provider = async () => await Provider.get("anthropic/claude-sonnet-4-20250514")

    const nodes = new Map<string, WorkflowNode>([
      [
        "planner",
        {
          name: "planner",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a task planning expert. Break down the following task into actionable, ordered steps.",
                },
                {
                  role: "user",
                  content: `Task: ${input.task}\n\n${input.context ? `Context: ${input.context}\n` : ""}`,
                },
              ],
            })
          },
          description: "Break down task into steps",
        },
      ],
      [
        "synthesizer",
        {
          name: "synthesizer",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const plan = input.output_planner || input.plan
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a synthesis expert. Create a comprehensive, actionable plan from the task breakdown.",
                },
                {
                  role: "user",
                  content: `Original Task: ${input.task}\n\nPlan Steps: ${JSON.stringify(plan)}`,
                },
              ],
            })
          },
          description: "Synthesize final plan",
        },
      ],
    ])

    return {
      nodes,
      edges: [
        { from: "planner", to: "synthesizer" },
        { from: "synthesizer", to: "END" },
      ],
      entryPoint: "planner",
      endPoints: ["END"],
      state: { task: "" },
    }
  }

  private buildCodeReviewWorkflow(): WorkflowGraph {
    const provider = async () => await Provider.get("anthropic/claude-sonnet-4-20250514")

    const nodes = new Map<string, WorkflowNode>([
      [
        "reviewer",
        {
          name: "reviewer",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a code review expert. Analyze the provided code for bugs, security issues, performance problems, and maintainability.",
                },
                {
                  role: "user",
                  content: `Code to review:\n\`\`\`\n${input.code}\n\`\`\`\n\n${input.context ? `Context: ${input.context}\n` : ""}`,
                },
              ],
            })
          },
          description: "Review code for issues",
        },
      ],
      [
        "prioritizer",
        {
          name: "prioritizer",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const review = input.output_reviewer || input.review
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a prioritization expert. Categorize code review issues by severity (critical, high, medium, low).",
                },
                {
                  role: "user",
                  content: `Code Review:\n${JSON.stringify(review)}`,
                },
              ],
            })
          },
          description: "Prioritize issues by severity",
        },
      ],
      [
        "reporter",
        {
          name: "reporter",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const prioritized = input.output_prioritizer || input.prioritized
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a report generation expert. Create a comprehensive, actionable report from the prioritized code review issues.",
                },
                {
                  role: "user",
                  content: `Prioritized Issues:\n${JSON.stringify(prioritized)}`,
                },
              ],
            })
          },
          description: "Generate final report",
        },
      ],
    ])

    return {
      nodes,
      edges: [
        { from: "reviewer", to: "prioritizer" },
        { from: "prioritizer", to: "reporter" },
        { from: "reporter", to: "END" },
      ],
      entryPoint: "reviewer",
      endPoints: ["END"],
      state: { code: "" },
    }
  }

  private buildDebuggingWorkflow(): WorkflowGraph {
    const provider = async () => await Provider.get("anthropic/claude-sonnet-4-20250514")

    const nodes = new Map<string, WorkflowNode>([
      [
        "analyze",
        {
          name: "analyze",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a debugging expert. Analyze the error and code to identify potential root causes.",
                },
                {
                  role: "user",
                  content: `Error: ${input.error}\n\nCode:\n\`\`\`\n${input.code || "No code provided"}\n\`\`\`\n\n${input.context ? `Context: ${input.context}\n` : ""}`,
                },
              ],
            })
          },
          description: "Analyze error and code",
        },
      ],
      [
        "hypothesize",
        {
          name: "hypothesize",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const analysis = input.output_analyze || input.analysis
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a debugging expert. Based on the analysis, propose likely root causes and hypotheses.",
                },
                {
                  role: "user",
                  content: `Analysis:\n${JSON.stringify(analysis)}`,
                },
              ],
            })
          },
          description: "Generate hypotheses",
        },
      ],
      [
        "solution",
        {
          name: "solution",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const hypotheses = input.output_hypothesize || input.hypotheses
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a debugging expert. Based on the hypotheses, provide actionable solutions and verification steps.",
                },
                {
                  role: "user",
                  content: `Hypotheses:\n${JSON.stringify(hypotheses)}`,
                },
              ],
            })
          },
          description: "Provide solutions",
        },
      ],
    ])

    return {
      nodes,
      edges: [
        { from: "analyze", to: "hypothesize" },
        { from: "hypothesize", to: "solution" },
        { from: "solution", to: "END" },
      ],
      entryPoint: "analyze",
      endPoints: ["END"],
      state: { error: "", code: "" },
    }
  }

  private buildAnalysisWorkflow(): WorkflowGraph {
    const provider = async () => await Provider.get("anthropic/claude-sonnet-4-20250514")

    const nodes = new Map<string, WorkflowNode>([
      [
        "analyze",
        {
          name: "analyze",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are an architecture and code analysis expert. Analyze the provided code for patterns, structure, and potential issues.",
                },
                {
                  role: "user",
                  content: `Code/Task: ${input.task}\n\n${input.context ? `Context: ${input.context}\n` : ""}`,
                },
              ],
            })
          },
          description: "Analyze code structure",
        },
      ],
      [
        "enrich",
        {
          name: "enrich",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const analysis = input.output_analyze || input.analysis
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a code enrichment expert. Add context, documentation references, and best practice notes.",
                },
                {
                  role: "user",
                  content: `Analysis:\n${JSON.stringify(analysis)}`,
                },
              ],
            })
          },
          description: "Enrich with context",
        },
      ],
      [
        "synthesize",
        {
          name: "synthesize",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const enriched = input.output_enrich || input.enriched
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a synthesis expert. Create a comprehensive analysis report from the enriched data.",
                },
                {
                  role: "user",
                  content: `Enriched Data:\n${JSON.stringify(enriched)}`,
                },
              ],
            })
          },
          description: "Synthesize final report",
        },
      ],
    ])

    return {
      nodes,
      edges: [
        { from: "analyze", to: "enrich" },
        { from: "enrich", to: "synthesize" },
        { from: "synthesize", to: "END" },
      ],
      entryPoint: "analyze",
      endPoints: ["END"],
      state: { task: "" },
    }
  }

  private buildTestGenerationWorkflow(): WorkflowGraph {
    const provider = async () => await Provider.get("anthropic/claude-sonnet-4-20250514")

    const nodes = new Map<string, WorkflowNode>([
      [
        "analyze",
        {
          name: "analyze",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a test generation expert. Analyze code and identify test requirements.",
                },
                {
                  role: "user",
                  content: `Code: ${input.code}\n\n${input.context ? `Context: ${input.context}\n` : ""}`,
                },
              ],
            })
          },
          description: "Analyze code for test requirements",
        },
      ],
      [
        "unit_tests",
        {
          name: "unit_tests",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const analysis = input.output_analyze || input.analysis
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a test generation expert. Generate comprehensive unit tests based on the analysis.",
                },
                {
                  role: "user",
                  content: `Analysis:\n${JSON.stringify(analysis)}`,
                },
              ],
            })
          },
          description: "Generate unit tests",
        },
      ],
      [
        "integration_tests",
        {
          name: "integration_tests",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const unitTests = input.output_unit_tests || input.unit_tests
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a test generation expert. Generate integration tests based on unit tests and code.",
                },
                {
                  role: "user",
                  content: `Unit Tests:\n${JSON.stringify(unitTests)}`,
                },
              ],
            })
          },
          description: "Generate integration tests",
        },
      ],
      [
        "e2e_tests",
        {
          name: "e2e_tests",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const integrationTests = input.output_integration_tests || input.integration_tests
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a test generation expert. Generate end-to-end tests based on integration tests.",
                },
                {
                  role: "user",
                  content: `Integration Tests:\n${JSON.stringify(integrationTests)}`,
                },
              ],
            })
          },
          description: "Generate E2E tests",
        },
      ],
      [
        "combine",
        {
          name: "combine",
          type: "llm",
          handler: async (input) => {
            const ai = new AI(await provider())
            const e2eTests = input.output_e2e_tests || input.e2e_tests
            return await ai.chat({
              messages: [
                {
                  role: "system",
                  content: "You are a test generation expert. Combine all tests into a cohesive test suite.",
                },
                {
                  role: "user",
                  content: `E2E Tests:\n${JSON.stringify(e2eTests)}`,
                },
              ],
            })
          },
          description: "Combine tests into suite",
        },
      ])

    return {
      nodes,
      edges: [
        { from: "analyze", to: "unit_tests" },
        { from: "unit_tests", to: "integration_tests" },
        { from: "integration_tests", to: "e2e_tests" },
        { from: "e2e_tests", to: "combine" },
        { from: "combine", to: "END" },
      ],
      entryPoint: "analyze",
      endPoints: ["END"],
      state: { code: "" },
    }
  }
  }

  public listWorkflows(): string[] {
    return Array.from(this.graphs.keys())
  }
}

let workflowEngine: WorkflowEngine | null = null

export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngine) {
    workflowEngine = new WorkflowEngine()
  }
  return workflowEngine
}

export async function initializeWorkflows(): Promise<void> {
  const engine = getWorkflowEngine()
  log.info("Workflow engine initialized", { workflows: engine.listWorkflows() })
}
