import { z } from "zod"
import { Provider } from "@/provider/provider"
import { AI } from "@/ai"

export const CodeReviewInput = z
  .object({
    code: z.string().describe("The code to review"),
    language: z.string().describe("Programming language (e.g., 'javascript', 'python', 'typescript', 'go')"),
    context: z.string().optional().describe("Additional context about the code, project, or specific concerns"),
    model: z.string().optional().describe("Model to use (defaults to Claude Sonnet for code review)"),
    focus_areas: z
      .array(z.enum([
        "security",
        "bugs",
        "performance",
        "maintainability",
        "readability",
        "best-practices",
        "design-patterns",
        "error-handling",
        "testing",
        "documentation",
      ]))
      .optional()
      .describe("Specific areas to focus on in the review"),
    severity_level: z
      .enum(["all", "critical-only", "critical-high", "critical-high-medium"])
      .optional()
      .describe("Minimum severity level to report"),
  })
  .describe("Code review input parameters")

export type CodeReviewInput = z.infer<typeof CodeReviewInput>

export const CodeReviewIssue = z
  .object({
    severity: z.enum(["critical", "high", "medium", "low", "info"]).describe("Issue severity"),
    category: z
      .string()
      .describe("Issue category (security, bugs, performance, maintainability, readability, best-practices, design-patterns, error-handling, testing, documentation)"),
    title: z.string().describe("Issue title"),
    description: z.string().describe("Detailed description of the issue"),
    location: z.string().describe("Code location (file, line, function, or class)"),
    code_snippet: z.string().optional().describe("Problematic code snippet"),
    suggestion: z.string().describe("How to fix or improve the code"),
    suggested_fix: z.string().optional().describe("Suggested fix with code"),
    references: z.string().array().optional().describe("Relevant documentation, best practices, or examples"),
  })
  .describe("Code review issue")

export type CodeReviewIssue = z.infer<typeof CodeReviewIssue>

export const CodeReviewResult = z
  .object({
    language: z.string().describe("Language reviewed"),
    overview: z.string().describe("High-level overview of code quality"),
    score: z.number().min(0).max(10).describe("Overall code quality score (0-10)"),
    scores: z
      .record(
        z.enum([
          "security",
          "bugs",
          "performance",
          "maintainability",
          "readability",
          "best-practices",
          "design-patterns",
          "error-handling",
          "testing",
          "documentation",
        ]),
        z.number().min(0).max(10)
      )
      .describe("Scores by category (0-10 each)"),
    issues: CodeReviewIssue.array().describe("Array of code review issues"),
    summary: z.string().describe("Brief summary of findings"),
    recommendations: z.string().array().describe("General recommendations"),
    strengths: z.string().array().optional().describe("Code strengths and good practices"),
  })
  .describe("Code review result")

export type CodeReviewResult = z.infer<typeof CodeReviewResult>

export async function performCodeReview(input: CodeReviewInput): Promise<CodeReviewResult> {
  const { code, language, context: userContext, model, focus_areas, severity_level } = input

  const provider = await Provider.get(model || "anthropic/claude-sonnet-4-20250514")

  const systemPrompt = `You are an expert code reviewer with deep knowledge of best practices, security vulnerabilities, performance optimization, and software design patterns.

Review the provided ${language} code and provide comprehensive feedback organized by severity and category.

## Severity Levels
- **Critical**: Must fix immediately (security vulnerabilities, crashes, data loss)
- **High**: Should fix soon (major bugs, performance issues, security concerns)
- **Medium**: Should fix in next cycle (minor bugs, maintainability issues)
- **Low**: Nice to have (minor improvements, suggestions)
- **Info**: Observations and positive feedback

## Categories to Evaluate
1. **Security**: OWASP Top 10, authentication, authorization, injection, XSS, CSRF
2. **Bugs**: Logic errors, edge cases, null/undefined handling, race conditions
3. **Performance**: Time complexity, memory usage, caching, database queries, algorithms
4. **Maintainability**: Code structure, modularity, naming, DRY principle, KISS principle
5. **Readability**: Clarity, comments, naming, complexity, documentation
6. **Best Practices**: Language-specific conventions, idiomatic code, SOLID principles
7. **Design Patterns**: Use of appropriate patterns, anti-patterns to avoid
8. **Error Handling**: Try-catch blocks, error propagation, logging, graceful degradation
9. **Testing**: Test coverage, edge cases, unit vs integration vs E2E
10. **Documentation**: Code comments, API docs, README requirements

${focus_areas && focus_areas.length > 0 ? `## Focus Areas
${focus_areas.map(area => `- ${area}`).join("\n")}
` : ""}${severity_level ? `## Severity Filter
Only report issues with severity >= ${severity_level}
` : ""}${userContext ? `## Additional Context
${userContext}
` : ""}

## Output Format
Provide your response as a JSON object with this structure:
{
  "language": "${language}",
  "overview": "Brief overview of code quality (2-3 sentences)",
  "score": 0-10,
  "scores": {
    "security": 0-10,
    "bugs": 0-10,
    "performance": 0-10,
    "maintainability": 0-10,
    "readability": 0-10,
    "best-practices": 0-10,
    "design-patterns": 0-10,
    "error-handling": 0-10,
    "testing": 0-10,
    "documentation": 0-10
  },
  "issues": [
    {
      "severity": "critical|high|medium|low|info",
      "category": "one of the 10 categories",
      "title": "short descriptive title",
      "description": "detailed explanation",
      "location": "file:line or function/class name",
      "code_snippet": "problematic code (optional)",
      "suggestion": "how to fix or improve",
      "suggested_fix": "code with fix (optional)",
      "references": ["relevant link 1", "relevant link 2"]
    }
  ],
  "summary": "Brief summary of key findings (2-3 sentences)",
  "recommendations": [
    "general recommendation 1",
    "general recommendation 2",
    "general recommendation 3"
  ],
  "strengths": [
    "positive aspect 1",
    "positive aspect 2"
  ]
}

Scoring Guidelines:
- 10: Excellent - follows all best practices, no issues
- 8-9: Very Good - minor issues or suggestions
- 6-7: Good - some issues that should be addressed
- 4-5: Fair - significant issues
- 0-3: Poor - major problems requiring extensive refactoring

Be constructive but thorough. Identify both issues and strengths.`

  const userPrompt = `Please review this ${language} code:

\`\`\`${language}
${code}
\`\`\`${userContext ? `\n\nContext: ${userContext}` : ""}`

  try {
    const ai = new AI(provider)
    const response = await ai.chat({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    })

    const content = typeof response === "string" ? response : response.content || ""
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    const jsonStr = jsonMatch ? jsonMatch[0] : content

    const result = CodeReviewResult.parse(JSON.parse(jsonStr))

    return result
  } catch (error) {
    throw new Error(`Code review failed: ${String(error)}`)
  }
}

export async function generateCodeReviewReport(
  result: CodeReviewResult,
  codeLength: number
): Promise<string> {
  const { language, overview, score, scores, issues, summary, recommendations, strengths } = result

  const critical = issues.filter(i => i.severity === "critical")
  const high = issues.filter(i => i.severity === "high")
  const medium = issues.filter(i => i.severity === "medium")
  const low = issues.filter(i => i.severity === "low")
  const info = issues.filter(i => i.severity === "info")

  let report = `# Code Review Report - ${language}\n\n`
  report += `## Overview\n${overview}\n\n`
  report += `## Overall Score: ${score}/10\n\n`

  report += `### Category Scores\n\n`
  const categoryLabels = {
    security: "Security",
    bugs: "Bugs",
    performance: "Performance",
    maintainability: "Maintainability",
    readability: "Readability",
    "best-practices": "Best Practices",
    "design-patterns": "Design Patterns",
    "error-handling": "Error Handling",
    testing: "Testing",
    documentation: "Documentation",
  }

  for (const [key, label] of Object.entries(categoryLabels)) {
    const score = scores[key]
    const bar = "█".repeat(Math.ceil(score))
    const dots = "░".repeat(10 - Math.ceil(score))
    report += `${label}: ${bar}${dots} ${score}/10\n`
  }

  report += `\n## Summary\n${summary}\n\n`

  if (strengths && strengths.length > 0) {
    report += `## ✅ Strengths\n\n`
    for (const strength of strengths) {
      report += `- ${strength}\n`
    }
    report += "\n"
  }

  if (critical.length > 0) {
    report += `## 🚨 Critical Issues\n\n`
    for (const issue of critical) {
      report += formatIssue(issue)
    }
  }

  if (high.length > 0) {
    report += `## ⚠️ High Severity Issues\n\n`
    for (const issue of high) {
      report += formatIssue(issue)
    }
  }

  if (medium.length > 0) {
    report += `## ⚠️ Medium Severity Issues\n\n`
    for (const issue of medium) {
      report += formatIssue(issue)
    }
  }

  if (low.length > 0) {
    report += `## ℹ️ Low Severity Issues\n\n`
    for (const issue of low) {
      report += formatIssue(issue)
    }
  }

  if (info.length > 0) {
    report += `## 💡 Suggestions\n\n`
    for (const issue of info) {
      report += formatIssue(issue)
    }
  }

  if (issues.length === 0) {
    report += `## ✅ No Issues Found\n\nGreat job! The code follows best practices and has no significant issues.\n`
  }

  if (recommendations && recommendations.length > 0) {
    report += `## 📋 Recommendations\n\n`
    for (const rec of recommendations) {
      report += `- ${rec}\n`
    }
  }

  report += `\n---\n\n`
  report += `**Code Analyzed**: ${codeLength} characters\n`
  report += `**Issues Found**: ${issues.length}\n`
  report += `**Generated by**: OpenCode Code Review Tool\n`

  return report
}

function formatIssue(issue: CodeReviewIssue): string {
  const severityEmoji = {
    critical: "🚨",
    high: "⚠️",
    medium: "⚠️",
    low: "ℹ️",
    info: "💡",
  }

  let section = `${severityEmoji[issue.severity]} **${issue.title}** (${issue.category})\n\n`
  section += `**Severity**: ${issue.severity.toUpperCase()}\n`
  section += `**Location**: \`${issue.location}\`\n\n`
  section += `**Description**\n${issue.description}\n\n`

  if (issue.code_snippet) {
    section += `**Current Code**\n\`\`\`\n${issue.code_snippet}\n\`\`\`\n\n`
  }

  if (issue.suggested_fix) {
    section += `**Suggested Fix**\n\`\`\`\n${issue.suggested_fix}\n\`\`\`\n\n`
  }

  section += `**Suggestion**\n${issue.suggestion}\n\n`

  if (issue.references && issue.references.length > 0) {
    section += `**References**\n`
    for (const ref of issue.references) {
      section += `- ${ref}\n`
    }
    section += "\n"
  }

  return `${section}---\n\n`
}

export function getReviewCategories(): string[] {
  return [
    "security",
    "bugs",
    "performance",
    "maintainability",
    "readability",
    "best-practices",
    "design-patterns",
    "error-handling",
    "testing",
    "documentation",
  ]
}

export function getSeverityLevels(): string[] {
  return ["critical", "high", "medium", "low", "info"]
}
