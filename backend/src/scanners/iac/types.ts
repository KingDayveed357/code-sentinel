// src/scanners/iac/types.ts
// ===================================================================
export interface CheckovCheck {
  check_id: string;
  check_name: string;
  description?: string;
  file_path: string;
  file_line_range?: [number, number];
  resource: string;
  check_type: string;
  severity?: string;
  guideline?: string;
  benchmark?: string[];
  code_block?: string[][];
  check_result?: {
    result: string;
  };
}
