import { z } from "zod"
import { Provider } from "@/provider/provider"
import { AI } from "@/ai"

const owaspTop10 = [
  {
    name: "Broken Access Control",
    description: "Users can act outside of their intended permissions",
    examples: ["Hardcoded admin passwords", "Missing authentication checks"],
  },
  {
    name: "Cryptographic Failures",
    description: "Failures in cryptography, often leading to sensitive data exposure",
    examples: ["Weak encryption", "Hardcoded keys", "Using deprecated algorithms"],
  },
  {
    name: "Injection",
    description: "Injection vulnerabilities (SQL, NoSQL, OS command injection)",
    examples: ["SQL injection", "Command injection", "LDAP injection"],
  },
  {
    name: "Insecure Design",
    description: "Design flaws that compromise security",
    examples: ["Missing rate limiting", "Insecure defaults", "Insufficient validation"],
  },
  {
    name: "Security Misconfiguration",
    description: "Improper configuration of security settings",
    examples: ["Default credentials", "Verbose error messages", "Open cloud storage"],
  },
  {
    name: "Identification and Authentication Failures",
    description: "Failures in identifying users and authentication",
    examples: ["Weak password policies", "Session fixation", "Missing MFA"],
  },
  {
    name: "Software and Data Integrity Failures",
    description: "Code and infrastructure changes not verified",
    examples: ["Insecure updates", "Missing integrity checks", "Insecure deserialization"],
  },
  {
    name: "Security Logging and Monitoring Failures",
    description: "Insufficient logging, monitoring, and incident response",
    examples: ["No audit logs", "Missing critical events", "Poor log format"],
  },
  {
    name: "Server-Side Request Forgery (SSRF)",
    description: "Server accepts requests without validating the source",
    examples: ["Fetch URLs from user input", "Open redirects", "URL parsing issues"],
  },
  {
    name: "Server-Side Template Injection (SSTI)",
    description: "Injection of malicious templates on the server side",
    examples: ["User input in templates", "Template engine vulnerabilities"],
  },
]

export const SecAuditInput = z
  .object({
    code: z.string().describe("The code to audit"),
    language: z.string().describe("Programming language (e.g., 'javascript', 'python', 'typescript')"),
    context: z.string().optional().describe("Additional context about the code, project, or specific concerns"),
    model: z.string().optional().describe("Model to use (defaults to a security-focused model)"),
    severity: z
      .enum(["critical", "high", "medium", "low"])
      .optional()
      .describe("Minimum severity level to report"),
  })
  .describe("Security audit input parameters")

export type SecAuditInput = z.infer<typeof SecAuditInput>

export const SecurityFinding = z
  .object({
    owasp: z.string().describe("OWASP category (1-10)"),
    category: z.string().describe("Specific vulnerability category"),
    severity: z.enum(["critical", "high", "medium", "low"]).describe("Vulnerability severity"),
    title: z.string().describe("Finding title"),
    description: z.string().describe("Detailed description of the vulnerability"),
    location: z.string().describe("Code location (file, line, function)"),
    example: z.string().optional().describe("Example of the vulnerability pattern"),
    recommendation: z.string().describe("How to fix the vulnerability"),
    code_snippet: z.string().optional().describe("Vulnerable code snippet"),
    fixed_code_snippet: z.string().optional().describe("Fixed code snippet"),
  })
  .describe("Security finding")

export type SecurityFinding = z.infer<typeof SecurityFinding>

export const SecAuditResult = z
  .object({
    language: z.string().describe("Language audited"),
    summary: z.string().describe("High-level summary of audit results"),
    findings: SecurityFinding.array().describe("Array of security findings"),
    critical_count: z.number().describe("Number of critical findings"),
    high_count: z.number().describe("Number of high findings"),
    medium_count: z.number().describe("Number of medium findings"),
    low_count: z.number().describe("Number of low findings"),
    recommendations: z.string().array().describe("General recommendations"),
    compliance_score: z.number().min(0).max(100).describe("Security compliance score (0-100)"),
  })
  .describe("Security audit result")

export type SecAuditResult = z.infer<typeof SecAuditResult>

export async function performSecurityAudit(input: SecAuditInput): Promise<SecAuditResult> {
  const { code, language, context: userContext, model, severity: minSeverity } = input

  const provider = await Provider.get(model || "anthropic/claude-sonnet-4-20250514")

  const systemPrompt = `You are an expert security auditor specializing in OWASP Top 10 vulnerabilities.

Analyze the provided ${language} code for security issues following OWASP Top 10 categories:
${owaspTop10.map((cat, i) => `${i + 1}. ${cat.name}: ${cat.description}`).join("\n")}

For each finding, provide:
1. OWASP category (1-10)
2. Specific vulnerability category
3. Severity level (critical, high, medium, low)
4. Finding title
5. Detailed description
6. Exact code location (file, line, function)
7. Example of the vulnerability pattern
8. Specific recommendation to fix
9. Vulnerable code snippet
10. Fixed code snippet (if applicable)

${minSeverity ? `Only report findings with severity >= ${minSeverity}` : "Report all findings"}.${userContext ? `\n\nAdditional context:\n${userContext}` : ""}

Structure your response as JSON with this schema:
{
  "language": "${language}",
  "summary": "Brief summary of security posture",
  "findings": [
    {
      "owasp": "1-10",
      "category": "specific category",
      "severity": "critical|high|medium|low",
      "title": "finding title",
      "description": "detailed description",
      "location": "file:line or function name",
      "example": "example pattern",
      "recommendation": "how to fix",
      "code_snippet": "vulnerable code",
      "fixed_code_snippet": "fixed code"
    }
  ],
  "recommendations": ["general recommendation 1", "general recommendation 2"],
  "compliance_score": 0-100
}`

  const userPrompt = `Please perform a security audit on this ${language} code:

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

    const result = SecAuditResult.parse(JSON.parse(jsonStr))

    return result
  } catch (error) {
    throw new Error(`Security audit failed: ${String(error)}`)
  }
}

export async function generateSecurityReport(
  findings: SecurityFinding[],
  language: string
): Promise<string> {
  const critical = findings.filter(f => f.severity === "critical")
  const high = findings.filter(f => f.severity === "high")
  const medium = findings.filter(f => f.severity === "medium")
  const low = findings.filter(f => f.severity === "low")

  const score = calculateSecurityScore(critical.length, high.length, medium.length, low.length)

  let report = `# Security Audit Report - ${language}\n\n`
  report += `## Summary\n\n`
  report += `- **Compliance Score**: ${score}/100\n`
  report += `- **Critical Findings**: ${critical.length}\n`
  report += `- **High Findings**: ${high.length}\n`
  report += `- **Medium Findings**: ${medium.length}\n`
  report += `- **Low Findings**: ${low.length}\n\n`

  if (critical.length > 0) {
    report += `## 🚨 Critical Findings\n\n`
    for (const finding of critical) {
      report += formatFinding(finding)
    }
  }

  if (high.length > 0) {
    report += `## ⚠️ High Severity Findings\n\n`
    for (const finding of high) {
      report += formatFinding(finding)
    }
  }

  if (medium.length > 0) {
    report += `## ⚠️ Medium Severity Findings\n\n`
    for (const finding of medium) {
      report += formatFinding(finding)
    }
  }

  if (low.length > 0) {
    report += `## ℹ️ Low Severity Findings\n\n`
    for (const finding of low) {
      report += formatFinding(finding)
    }
  }

  if (findings.length === 0) {
    report += `## ✅ No Vulnerabilities Found\n\nNo security issues were detected in the code.`
  }

  return report
}

function formatFinding(finding: SecurityFinding): string {
  const severityEmoji = {
    critical: "🚨",
    high: "⚠️",
    medium: "⚠️",
    low: "ℹ️",
  }

  let section = `${severityEmoji[finding.severity]} **${finding.title}** (${finding.owasp}. ${finding.category})\n\n`
  section += `**Severity**: ${finding.severity.toUpperCase()}\n`
  section += `**Location**: \`${finding.location}\`\n\n`
  section += `**Description**\n${finding.description}\n\n`

  if (finding.example) {
    section += `**Example**\n\`\`\`\n${finding.example}\n\`\`\`\n\n`
  }

  if (finding.code_snippet) {
    section += `**Vulnerable Code**\n\`\`\`\n${finding.code_snippet}\n\`\`\`\n\n`
  }

  section += `**Recommendation**\n${finding.recommendation}\n\n`

  if (finding.fixed_code_snippet) {
    section += `**Fixed Code**\n\`\`\`\n${finding.fixed_code_snippet}\n\`\`\`\n\n`
  }

  return `${section}---\n\n`
}

function calculateSecurityScore(
  critical: number,
  high: number,
  medium: number,
  low: number
): number {
  const weights = { critical: 30, high: 20, medium: 10, low: 5 }
  const score =
    100 - (critical * weights.critical + high * weights.high + medium * weights.medium + low * weights.low)
  return Math.max(0, Math.min(100, score))
}

export function getOWASPCategories(): typeof owaspTop10 {
  return owaspTop10
}
