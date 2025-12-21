// // components/auth/register-form.tsx
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

// export function RegisterForm() {
//   const { signUp, oauthSignIn } = useAuth();
//   const { showLoading, showSuccess, showError, dismissAlert, AlertContainer } =
//     useAuthToast();

//   const [name, setName] = useState("");
//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [isLoading, setIsLoading] = useState(false);
//   const [acceptedTerms, setAcceptedTerms] = useState(false);

//   const handleSubmit = async (e: React.FormEvent) => {
//     e.preventDefault();

//     if (!acceptedTerms) {
//       showError("Please accept the Terms of Service and Privacy Policy");
//       return;
//     }

//     console.log("📌 RegisterForm → SUBMIT PAYLOAD:", {
//       fullName: name,
//       email,
//       password,
//       acceptedTerms,
//     });

//     const loadingId = showLoading("Creating your account...");
//     setIsLoading(true);

//     try {
//       await signUp({
//         fullName: name,
//         email,
//         password,
//       });

//       dismissAlert(loadingId);
//       showSuccess("Account created successfully! Redirecting...");
//     } catch (error: any) {
//       dismissAlert(loadingId);
//       showError(error.message || "Failed to create account. Please try again.");
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
//               Or create account with email
//             </span>
//           </div>
//         </div>

//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div className="space-y-2">
//             <Label htmlFor="name">Full Name</Label>
//             <Input
//               id="name"
//               type="text"
//               placeholder="John Doe"
//               value={name}
//               onChange={(e) => setName(e.target.value)}
//               required
//               disabled={isLoading}
//             />
//           </div>

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
//             <Label htmlFor="password">Password</Label>
//             <Input
//               id="password"
//               type="password"
//               placeholder="Minimum 8 characters"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               required
//               minLength={8}
//               disabled={isLoading}
//             />
//           </div>

//           <div className="flex items-start space-x-2">
//             <Checkbox
//               id="terms"
//               checked={acceptedTerms}
//               onCheckedChange={(checked) =>
//                 setAcceptedTerms(checked as boolean)
//               }
//               disabled={isLoading}
//             />
//             <label
//               htmlFor="terms"
//               className="text-sm leading-relaxed peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
//             >
//               I agree to the{" "}
//               <Link href="/terms" className="text-primary hover:underline">
//                 Terms of Service
//               </Link>{" "}
//               and{" "}
//               <Link href="/privacy" className="text-primary hover:underline">
//                 Privacy Policy
//               </Link>
//             </label>
//           </div>

//           <Button type="submit" className="w-full" disabled={isLoading}>
//             {isLoading ? (
//               <>
//                 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
//                 Creating Account...
//               </>
//             ) : (
//               "Create Account"
//             )}
//           </Button>
//         </form>
//       </div>
//     </>
//   );
// }
