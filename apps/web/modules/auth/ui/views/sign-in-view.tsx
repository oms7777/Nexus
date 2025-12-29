import { SignIn } from "@clerk/nextjs";

export const SignInView = () => {
  return (
    <SignIn
      routing="hash"
      appearance={{
        elements: {
          footerAction: "hidden",
        },
      }}
    />
  );
};
