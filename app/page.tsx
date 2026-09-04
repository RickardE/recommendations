import { loadMatrix } from '@/lib/matrixLoader';
import { getAllSubdomains } from '@/lib/matrixParser';
import AppClient from '@/components/AppClient';

// Server Component: reads and parses the matrix once, then hands typed
// data down to the interactive client component. Keeps filesystem access
// out of the client bundle and out of the algorithm's unit tests.
export default function Page() {
  const programs = loadMatrix();
  const subdomains = getAllSubdomains(programs);
  const initialScores = Object.fromEntries(subdomains.map((s) => [s, 50]));

  return <AppClient programs={programs} subdomains={subdomains} initialScores={initialScores} />;
}
