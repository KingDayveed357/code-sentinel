// // components/auth/login-form.tsx
// "use client";

// import { useState } from "react";
// import { Button } from "@/components/ui/button";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Checkbox } from "@/components/ui/checkbox";
// import { Github, Mail, Loader2 } from "lucide-react";
// import Link from "next/link";
// import { useAuth } from "@/hooks/old-use-auth";
// import { useAuthToast } from "./auth-alerts";

// export function LoginForm() {
//   const { signIn, oauthSignIn } = useAuth();
//   const { showLoading, showSuccess, showError, dismissAlert, AlertContainer } =
//     useAuthToast();

//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [rememberMe, setRememberMe] = useState(false);
//   const [isLoading, setIsLoading] = useState(false);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     const loadingId = showLoading("Signing you in...");
//     setIsLoading(true);

//     try {
//       await signIn({ email, password });

//       dismissAlert(loadingId);
//       showSuccess("Welcome back! Redirecting...");
//     } catch (error: any) {
//       dismissAlert(loadingId);
//       showError(error.message || "Invalid credentials. Please try again.");
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleOAuthSignIn = async (provider: "google" | "github") => {
//     const loadingId = showLoading(
//       `Connecting to ${provider === "google" ? "Google" : "GitHub"}...`
//     );

//     try {
//       await oauthSignIn(provider);
//     } catch (error: any) {
//       dismissAlert(loadingId);
//       showError(error.message || `Failed to connect with ${provider}`);
//     }
//   };

//   return (
//     <>
//       <AlertContainer />

//       <div className="space-y-6">
//         <Button
//           variant="outline"
//           className="w-full bg-transparent"
//           type="button"
//           onClick={() => handleOAuthSignIn("google")}
//           disabled={isLoading}
//         >
//           <Mail className="mr-2 h-5 w-5" />
//           Continue with Google
//         </Button>

//         <Button
//           variant="outline"
//           className="w-full bg-transparent"
//           type="button"
//           onClick={() => handleOAuthSignIn("github")}
//           disabled={isLoading}
//         >
//           <Github className="mr-2 h-5 w-5" />
//           Continue with GitHub
//         </Button>

//         <div className="relative">
//           <div className="absolute inset-0 flex items-center">
//             <span className="w-full border-t border-border" />
//           </div>
//           <div className="relative flex justify-center text-xs uppercase">
//             <span className="bg-background px-2 text-muted-foreground">
//               Or continue with email
//             </span>
//           </div>
//         </div>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="space-y-2">
//             <Label htmlFor="email">Email</Label>
//             <Input
//               id="email"
//               type="email"
//               placeholder="name@example.com"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               required
//               disabled={isLoading}
//             />
//           </div>

//           <div className="space-y-2">
//             <div className="flex items-center justify-between">
//               <Label htmlFor="password">Password</Label>
//               <Link
//                 href="/forgot-password"
//                 className="text-xs text-primary hover:underline"
//                 tabIndex={-1}
//               >
//                 Forgot password?
//               </Link>
//             </div>
//             <Input
//               id="password"
//               type="password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               disabled={isLoading}
//             />
//           </div>

//           <div className="flex items-center space-x-2">
//             <Checkbox
//               id="remember"
//               checked={rememberMe}
//               onCheckedChange={(checked) => setRememberMe(checked as boolean)}
//               disabled={isLoading}
//             />
//             <label
//               htmlFor="remember"
//               className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
//             >
//               Remember me
//             </label>
//           </div>

//           <Button type="submit" className="w-full" disabled={isLoading}>
//             {isLoading ? (
//               <>
//                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                 Signing In...
//               </>
//             ) : (
//               "Sign In"
//             )}
//           </Button>
//         </form>
//       </div>
//     </>
//   );
// }
