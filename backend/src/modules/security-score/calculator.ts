// src/modules/security-score/calculator.ts - Security Score Calculation

export function calculateSecurityScore(vulnerabilities: any[]): {
  score: number;
  grade: string;
  breakdown: any;
} {
  let score = 100;
  let breakdown = { deductions: {}, bonuses: {} };
  
  const counts = {
    critical: vulnerabilities.filter(v => v.severity === 'critical').length,
    high: vulnerabilities.filter(v => v.severity === 'high').length,
    medium: vulnerabilities.filter(v => v.severity === 'medium').length,
    low: vulnerabilities.filter(v => v.severity === 'low').length,
    secrets: vulnerabilities.filter(v => v.type === 'secrets').length
  };
  
  // Deductions
  score -= counts.critical * 10;
  score -= counts.high * 5;
  score -= counts.medium * 2;
  score -= counts.low * 0.5;
  score -= counts.secrets * 15; // Secrets are especially bad
  
  breakdown.deductions = counts;
  
  // Bonuses
  if (counts.critical === 0 && counts.high === 0) {
    score += 10;
    breakdown.bonuses = { no_critical_high: 10 };
  }
  
  // Clamp score between 0 and 100
  score = Math.max(0, Math.min(100, score));
  
  // Assign letter grade
  const grade = score >= 90 ? 'A' : 
                score >= 80 ? 'B' :
                score >= 70 ? 'C' :
                score >= 60 ? 'D' : 'F';
  
  return { score: Math.round(score), grade, breakdown };
}
