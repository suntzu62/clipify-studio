import { SignUp } from '@clerk/clerk-react';

const Register = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <SignUp fallbackRedirectUrl="/dashboard" />
      </div>
    </div>
  );
};

export default Register;