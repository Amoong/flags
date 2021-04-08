import * as React from "react";
import { GetServerSideProps } from "next";
import { Layout } from "../../components/Layout";
import { Result } from "../../components/Result";
import { InitialFlagState, useFlags } from "@happykit/flags/client";
import { getFlags } from "@happykit/flags/server";

type User = { key: string; name: string };
type AppFlags = { size: "small" | "medium" | "large" };
type ServerSideProps = {
  initialFlagState: InitialFlagState<AppFlags>;
};

// This demo uses server-side rendering, but this works just as well with
// static site generation or client-only rendering.
export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (
  context
) => {
  const { initialFlagState } = await getFlags<AppFlags>({ context });
  return { props: { initialFlagState } };
};

export default function Page(props: ServerSideProps) {
  // This demo shows that you never need to deal with the visitor key yourself
  const flagBag = useFlags({ initialState: props.initialFlagState });

  return (
    <Layout
      title="Targeting by Visitor Key"
      source={`https://github.com/happykit/flags/blob/${process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF}/example/pages/demo/targeting-by-visitor-key.tsx`}
    >
      <article className="py-4 prose max-w-prose">
        <p>
          This demo shows how to use <code>@happykit/flags</code> for targeting
          visitors.
        </p>
        <p>
          HappyKit allows you to do percentage-based rollouts or A/B testing. To
          do this, HappyKit automatically creates a unique visitor key for every
          visitor and saves it as a cookie. You don't need to manage it
          yourself. The visitor key can not be passed in at all.
        </p>
        <p>
          If you know more about the visitor, you can use configure your
          HappyKit Flags to use percentage-based rollouts or A/B testing based
          on the passed in user instead. HappyKit makes distinguishes users and
          visitors. You have control over the user HappyKit sees, but HappyKit
          controls the visitor.
        </p>
        <Result key="targeting-by-visitor-key" value={flagBag} />
        <p>
          Note that aside from visitors, HappyKit also has the concepts of a
          user and traits. These three concepts are all independent of each
          other.
        </p>
      </article>
    </Layout>
  );
}