"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, CreditCard, ExternalLink, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "@/hooks/use-workspace";
import { billingApi } from "@/lib/api/billing";
import { Skeleton } from "@/components/ui/skeleton";

export function PaymentHistory() {
  const { workspace, role } = useWorkspace();
  const isOwner = role === "owner";

  const { data: invoices, isLoading: isLoadingInvoices } = useQuery({
    queryKey: ["invoices", workspace?.id],
    queryFn: () => billingApi.getInvoices(workspace!.id),
    enabled: !!workspace?.id,
  });

  const { data: subscription, isLoading: isLoadingSub } = useQuery({
    queryKey: ["subscription", workspace?.id],
    queryFn: () => billingApi.getSubscription(workspace!.id),
    enabled: !!workspace?.id,
  });

  if (isLoadingInvoices || isLoadingSub) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Payment Method */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Payment Method
          </CardTitle>
          <CardDescription>Manage how you pay for your subscription</CardDescription>
        </CardHeader>
        <CardContent>
          {subscription?.payment_method ? (
            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-background border rounded font-bold text-xs uppercase">
                  {subscription.payment_method.brand}
                </div>
                <div>
                  <p className="font-semibold capitalize">{subscription.payment_method.brand} •••• {subscription.payment_method.last4}</p>
                  <p className="text-xs text-muted-foreground">Expires {subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : "--"}</p>
                </div>
              </div>
              {isOwner && (
                <Button variant="outline" size="sm">Update</Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 border border-dashed rounded-lg text-center space-y-2">
              <CreditCard className="h-8 w-8 text-muted-foreground opacity-50" />
              <p className="text-sm font-medium">No payment method on file</p>
              <p className="text-xs text-muted-foreground">Add a payment method by upgrading to a paid plan</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card className="border-2 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-lg">Invoices</CardTitle>
          <CardDescription>View and download your past invoices</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {!invoices?.length ? (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">No invoices found for this workspace.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead className="pl-6">Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right pr-6">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="pl-6 font-medium">
                      {new Date(invoice.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      {(invoice.amount / 100).toLocaleString('en-US', { style: 'currency', currency: invoice.currency })}
                    </TableCell>
                    <TableCell>
                      <Badge variant={invoice.status === 'paid' ? 'default' : 'outline'} className="capitalize">
                        {invoice.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button variant="ghost" size="sm" asChild>
                        <a href={invoice.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Download className="h-4 w-4 mr-2" />
                          PDF
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {!isOwner && (
        <div className="flex items-center gap-2 p-4 border border-amber-200 bg-amber-50 rounded-lg dark:bg-amber-900/10 dark:border-amber-900/30">
          <ShieldAlert className="h-5 w-5 text-amber-600 dark:text-amber-500" />
          <p className="text-sm text-amber-800 dark:text-amber-400 font-medium">
            Billing management is restricted to the workspace owner.
          </p>
        </div>
      )}
    </div>
  );
}
