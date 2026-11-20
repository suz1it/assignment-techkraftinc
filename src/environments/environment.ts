// Production build configuration.
export const environment = {
  production: true,
  // There is no real backend for this assignment: the in-app mock backend interceptor serves
  // /auth/* and /api/* in every build. Documented in the README.
  useMockBackend: true,
  apiBaseUrl: '',
};
