import * as React from "react";
import { Layout } from "../../components/Layout";
import { Result } from "../../components/Result";
import { useFlags } from "@happykit/flags/client";

export default function Page() {
  const flagBag = useFlags();
  return (
    <Layout
      title="Example: Basic Usage"
      source="https://github.com/happykit/flags/blob/example/pages/examples/basic-usage.tsx"
    >
      <div className="py-4">
        <p className="max-w-prose text-gray-600">
          This example shows how to use @happykit/flags for static pages.
        </p>
        <Result value={flagBag} />
      </div>
    </Layout>
  );
}