// Deterministic validation for SKILL.md files

export interface SkillFrontmatter {
    name: string
    description: string
    [key: string]: unknown
}

/**
 * Parse YAML frontmatter from SKILL.md content
 */
export function parseSkillFrontmatter(content: string): SkillFrontmatter | null {
    // Match content between --- delimiters
    const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!frontmatterMatch) {
        return null
    }

    const frontmatterText = frontmatterMatch[1]
    const result: Record<string, unknown> = {}

    // Simple YAML parsing for key: value pairs
    const lines = frontmatterText.split('\n')
    for (const line of lines) {
        const colonIndex = line.indexOf(':')
        if (colonIndex > 0) {
            const key = line.slice(0, colonIndex).trim()
            let value = line.slice(colonIndex + 1).trim()

            // Remove quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1)
            }

            result[key] = value
        }
    }

    if (typeof result.name === 'string' && typeof result.description === 'string') {
        return result as SkillFrontmatter
    }

    return null
}

/**
 * Validate skill name follows kebab-case convention
 */
export function isValidSkillName(name: string): boolean {
    // kebab-case: lowercase letters, numbers, and hyphens
    // Must start with a letter, can't end with hyphen
    return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name)
}

/**
 * Validate the structure of a SKILL.md file
 * Returns an array of issues (empty if valid)
 */
export function validateSkillStructure(content: string): string[] {
    const issues: string[] = []

    // Check if content starts with frontmatter
    if (!content.startsWith('---')) {
        issues.push('SKILL.md must start with YAML frontmatter (---)')
        return issues // Can't continue without frontmatter
    }

    // Parse frontmatter
    const frontmatter = parseSkillFrontmatter(content)

    if (!frontmatter) {
        issues.push('Invalid or missing YAML frontmatter')
        return issues
    }

    // Check required fields
    if (!frontmatter.name) {
        issues.push('Missing required field: name')
    } else if (typeof frontmatter.name !== 'string') {
        issues.push('Field "name" must be a string')
    } else if (!isValidSkillName(frontmatter.name)) {
        issues.push(`Invalid skill name "${frontmatter.name}". Must be kebab-case (lowercase letters, numbers, hyphens)`)
    }

    if (!frontmatter.description) {
        issues.push('Missing required field: description')
    } else if (typeof frontmatter.description !== 'string') {
        issues.push('Field "description" must be a string')
    } else if (frontmatter.description.length < 10) {
        issues.push('Description is too short (minimum 10 characters)')
    }

    // Check for body content after frontmatter
    const bodyMatch = content.match(/^---[\s\S]*?---\s*\n([\s\S]*)$/)
    if (!bodyMatch || !bodyMatch[1].trim()) {
        issues.push('SKILL.md must have content after the frontmatter')
    } else {
        const body = bodyMatch[1]

        // Check for at least some meaningful content (headers, paragraphs)
        if (body.length < 100) {
            issues.push('SKILL.md body content is too short (minimum 100 characters)')
        }

        // Check for at least one header
        if (!/#\s+\w/.test(body)) {
            issues.push('SKILL.md should have at least one header section')
        }
    }

    return issues
}

/**
 * Sanitize a skill name to be valid kebab-case
 */
export function sanitizeSkillName(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
}

