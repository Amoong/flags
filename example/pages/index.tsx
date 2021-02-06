import Head from "next/head";
import * as React from "react";
import {
  useFlags,
  FlagUser,
  InitialFlagState,
  Traits,
} from "@happykit/flags/client";
import { getFlags } from "@happykit/flags/server";
import { GetServerSideProps } from "next";

type Flags = {
  "baby-koalas": boolean;
  meal: "small" | "medium" | "large";
  dopestflagonearth: boolean;
  "numbered-koalas": number;
};

type ServerSideProps = {
  initialFlagState: InitialFlagState<Flags>;
};

export const getServerSideProps: GetServerSideProps<ServerSideProps> = async (
  context
) => {
  const { initialFlagState } = await getFlags<Flags>({
    context,
    user: { key: "jennyc" },
    traits: { employee: true },
  });
  return { props: { initialFlagState } };
};

export default function Home(props: ServerSideProps) {
  const [user, setUser] = React.useState<null | FlagUser>({
    key: "jennyc",
  });
  const [traits, setTraits] = React.useState<null | Traits>({
    employee: true,
  });

  const flagBag = useFlags<Flags>({
    initialState: props.initialFlagState,
    // user: { key: "jennyc" },
    user,
    traits,
    revalidateOnFocus: false,
    // traits: { random: "r" },
  });

  return (
    <div>
      <Head>
        <title>@happykit/flags examples</title>
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main>
        <button
          type="button"
          onClick={() => {
            console.log("toggle user");
            setUser((prev) => (prev ? null : { key: "jennyc" }));
          }}
        >
          toggle user
        </button>{" "}
        <button
          type="button"
          onClick={() => {
            console.log("toggle traits");
            setTraits((prev) => (prev ? null : { employee: true }));
          }}
        >
          toggle traits
        </button>{" "}
        <p>
          {user ? "has user" : "no user"}, {traits ? "has traits" : "no traits"}
        </p>
        <pre>{JSON.stringify(flagBag, null, 2)}</pre>
      </main>
    </div>
  );
}