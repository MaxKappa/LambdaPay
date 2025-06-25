import { Amplify, type ResourcesConfig } from "aws-amplify";
export const authConfig: ResourcesConfig["Auth"] = {
    Cognito: {
        userPoolId: import.meta.env.VITE_AMPLIFY_USERPOOL_ID || "",
        userPoolClientId: import.meta.env.VITE_AMPLIFY_WEBCLIENT_ID || "",
        identityPoolId: import.meta.env.VITE_AMPLIFY_IDENTITYPOOL_ID || "",
        loginWith: {
            email: true,
        },
        signUpVerificationMethod: "code",
        userAttributes: {
            email: {
                required: true,
            },
            name: {
                required: true,
            },
            phone_number: {
                required: false,
            },
            birthdate: {
                required: false,
            },
        },
        allowGuestAccess: true,
        passwordFormat: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
            requireSpecialCharacters: true,
        },
    },

};

Amplify.configure(
    {
        Auth: authConfig,
    }
);

export default function ConfigureAmplifyClientSide() {
    return null;
}