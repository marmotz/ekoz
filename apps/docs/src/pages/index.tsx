import { Redirect } from '@docusaurus/router';

export const HOME_REDIRECT_TARGET = '/guides/intro';

export default function Home() {
  return <Redirect to={HOME_REDIRECT_TARGET} />;
}
