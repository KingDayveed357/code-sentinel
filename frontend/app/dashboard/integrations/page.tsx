// app/dashboard/integrations/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Github,
  GitBranch,
  Rocket,
  MessageSquare,
  Package,
  Container,
  AlertCircle,
  Loader2,
  Check,
  Settings,
  ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { repositoriesApi } from "@/lib/api/repositories";

interface Integration {
  id: string;
  name: string;
  category: "source_control" | "ci_cd" | "notifications" | "artifact_registries";
  icon: any;
  description: string;
  available: boolean;
  connected?: boolean;
  account?: any;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Load actual provider status
      const providersData = await repositoriesApi.getProviders();
      
      const allIntegrations: Integration[] = [
        // Source Control
        {
          id: "github",
          name: "GitHub",
          category: "source_control",
          icon: Github,
          description: "Import and scan GitHub repositories",
          available: true,
          connected: providersData.providers.find(p => p.id === "github")?.connected || false,
          account: providersData.providers.find(p => p.id === "github")?.account,
        },
        {
          id: "gitlab",
          name: "GitLab",
          category: "source_control",
          icon: GitBranch,
          description: "Import and scan GitLab projects",
          available: false,
        },
        {
          id: "bitbucket",
          name: "Bitbucket",
          category: "source_control",
          icon: GitBranch,
          description: "Import and scan Bitbucket repositories",
          available: false,
        },
        // CI/CD
        {
          id: "jenkins",
          name: "Jenkins",
          category: "ci_cd",
          icon: Rocket,
          description: "Integrate with Jenkins pipelines",
          available: false,
        },
        // Notifications
        {
          id: "slack",
          name: "Slack",
          category: "notifications",
          icon: MessageSquare,
          description: "Send scan results and alerts to Slack",
          available: false,
        },
        // Artifact Registries
        {
          id: "npm",
          name: "NPM Registry",
          category: "artifact_registries",
          icon: Package,
          description: "Scan NPM packages for vulnerabilities",
          available: false,
        },
        {
          id: "dockerhub",
          name: "Docker Hub",
          category: "artifact_registries",
          icon: Container,
          description: "Scan container images for security issues",
          available: false,
        },
      ];
      
      setIntegrations(allIntegrations);
    } catch (err: any) {
      setError(err.message || "Failed to load integrations");
    } finally {
      setLoading(false);
    }
  };

  const categories = {
    source_control: {
      title: "Source Control",
      description: "Connect your code repositories",
    },
    ci_cd: {
      title: "CI/CD",
      description: "Integrate with your deployment pipelines",
    },
    notifications: {
      title: "Notifications",
      description: "Get alerts when vulnerabilities are found",
    },
    artifact_registries: {
      title: "Artifact Registries",
      description: "Scan packages and container images",
    },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-1">
          Connect CodeSentinel with your development tools and workflows
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Integration Categories */}
      {Object.entries(categories).map(([categoryKey, category]) => {
        const categoryIntegrations = integrations.filter(
          (i) => i.category === categoryKey
        );

        return (
          <div key={categoryKey} className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">{category.title}</h2>
              <p className="text-sm text-muted-foreground">{category.description}</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryIntegrations.map((integration) => {
                const Icon = integration.icon;
                return (
                  <Card
                    key={integration.id}
                    className={`relative transition-all ${
                      integration.available
                        ? "hover:shadow-lg hover:-translate-y-1 cursor-pointer"
                        : "opacity-60"
                    }`}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10">
                            <Icon className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{integration.name}</CardTitle>
                            <div className="flex items-center gap-2 mt-1">
                              {integration.connected ? (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-400">
                                  <Check className="h-3 w-3 mr-1" />
                                  Connected
                                </Badge>
                              ) : integration.available ? (
                                <Badge variant="outline">Not Connected</Badge>
                              ) : (
                                <Badge variant="secondary">Coming Soon</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="mb-4">
                        {integration.description}
                      </CardDescription>

                      {integration.connected && integration.account && (
                        <div className="mb-4 p-3 bg-muted rounded-lg">
                          <div className="flex items-center gap-2 text-sm">
                            {integration.account.avatar_url && (
                              <img
                                src={integration.account.avatar_url}
                                alt={integration.account.username}
                                className="w-6 h-6 rounded-full"
                              />
                            )}
                            <span className="font-medium">@{integration.account.username}</span>
                          </div>
                        </div>
                      )}

                      {integration.available && (
                        <div className="flex gap-2">
                          {integration.connected ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                asChild
                              >
                                <Link href={`/dashboard/integrations/${integration.id}`}>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Settings
                                </Link>
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1"
                              asChild
                            >
                              <Link href={`/dashboard/integrations/${integration.id}`}>
                                Connect
                                <ExternalLink className="ml-2 h-4 w-4" />
                              </Link>
                            </Button>
                          )}
                        </div>
                      )}

                      {!integration.available && (
                        <p className="text-xs text-muted-foreground">
                          This integration is coming soon. Check back later!
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}