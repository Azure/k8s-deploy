import * as core from '@actions/core'

export function validateTimeoutDuration(duration: string): string {
   const trimmed = duration.trim()

   // Parse number and optional unit using regex
   const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/i.exec(trimmed)
   if (!match) {
      throw new Error(
         `Invalid duration format: "${duration}". Use: number + unit (30s, 5m, 1h) or just number (assumes minutes)`
      )
   }

   const value = parseFloat(match[1])
   const unit = match[2]?.toLowerCase() || 'm'

   if (value <= 0) {
      throw new Error(`Duration must be positive: "${duration}"`)
   }

   // Calculate total seconds for validation
   const multipliers = {ms: 0.001, s: 1, m: 60, h: 3600}
   const totalSeconds = value * multipliers[unit as keyof typeof multipliers]

   // Validate bounds (1ms to 24h)
   if (totalSeconds < 0.001 || totalSeconds > 86400) {
      throw new Error(`Duration out of range (1ms to 24h): "${duration}"`)
   }

   // Log assumption for bare numbers (when no unit was provided)
   if (!duration.trim().match(/\d+(ms|s|m|h)$/i)) {
      core.debug(
         `No unit specified for timeout "${duration}", assuming minutes`
      )
   }

   return `${value}${unit}`
}
