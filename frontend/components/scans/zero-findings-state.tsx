"use client";

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";


export function ZeroFindingsState() {
  return (
    <Card className="border-emerald-500/30 bg-gradient-to-br from-emerald-950/20 to-teal-950/10 backdrop-blur-sm">
      <CardContent className="pt-12 pb-12">
        <div className="flex flex-col items-center justify-center text-center">
          <div className="p-4 rounded-full bg-emerald-500/10 border-2 border-emerald-500/30 mb-6">
            <ShieldCheck className="h-12 w-12 text-emerald-400" />
          </div>
            {/* <PartyPopper className="h-12 w-12 sm:h-16 sm:w-16 text-green-600 mx-auto mb-4" /> */}
          <h3 className="text-2xl font-semibold text-slate-100 mb-2">
            No vulnerabilities found
          </h3>
          <p className="text-slate-400 max-w-md">
            Your code is looking great! We didn't detect any security issues in this scan.
          </p>
          <div className="mt-6 flex items-center gap-6 text-sm text-slate-500">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-400"></div>
              <span>All scanners completed</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-blue-400"></div>
              <span>Zero issues detected</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>

  );
}
