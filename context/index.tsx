import { FunctionComponent, createContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import LitJsSdk from "@lit-protocol/sdk-browser";
import Krebit from "@krebitdao/reputation-passport";
import { Orbis } from "@orbisclub/orbis-sdk";

import { getWalletInformation, normalizeSchema } from "../utils";

import { config } from "@krebitdao/reputation-passport/dist/config";

// types
import { Passport } from "@krebitdao/reputation-passport/dist/core/Passport";
import { Krebit as Issuer } from "@krebitdao/reputation-passport/dist/core/Krebit";
import { IProfile } from "../utils/normalizeSchema";

interface IProps {
  children: JSX.Element;
}

export interface IWalletInformation {
  ethProvider: ethers.providers.ExternalProvider;
  address: string;
  wallet: ethers.providers.JsonRpcSigner;
}

export const GeneralContext = createContext(undefined);

export const GeneralProvider: FunctionComponent<IProps> = (props) => {
  const { children } = props;
  const [profile, setProfile] = useState<IProfile | undefined>();
  const [status, setStatus] = useState("idle");
  const [passport, setPassport] = useState<Passport>();
  const [issuer, setIssuer] = useState<Issuer>();
  const [publicPassport, setPublicPassport] = useState<Passport>();
  const [orbis, setOrbis] = useState<Orbis>();
  const [walletInformation, setWalletInformation] = useState<
    IWalletInformation | undefined
  >();

  useEffect(() => {
    const isAuthenticated = async () => {
      setStatus("pending");

      const publicPassport = new Krebit.core.Passport();
      setPublicPassport(publicPassport);

      const orbis = new Orbis();
      setOrbis(orbis);

      const information = await getWalletInformation();
      setWalletInformation(information);

      const passport = new Krebit.core.Passport({
        ...information,
        litSdk: LitJsSdk,
      });
      const isPassportConnected = await passport.isConnected();

      const issuer = new Krebit.core.Krebit({
        ...information,
        litSdk: LitJsSdk,
      });
      const isIssuerConnected = await issuer.isConnected();

      const isOrbisConnected = await orbis.isConnected();

      if (isPassportConnected && isIssuerConnected && isOrbisConnected) {
        const profile = await normalizeSchema.profile({
          passport,
          orbis,
        });
        setProfile(profile);

        setPassport(passport);
        setIssuer(issuer);
      }

      setStatus("resolved");
    };

    isAuthenticated();
  }, []);

  const connect = async () => {
    setStatus("pending");

    try {
      const information = await getWalletInformation();
      setWalletInformation(information);

      let defaultChainId = "1";

      /** Check if the user trying to connect already has an existing did on Orbis */
      let defaultDID = await Krebit.lib.orbis.getDefaultDID(
        information.address
      );

      if (defaultDID) {
        let _didArr = defaultDID.split(":");
        defaultChainId = _didArr[3];
      }

      const passport = new Krebit.core.Passport({
        ...information,
        litSdk: LitJsSdk,
      });
      const passportConnection = await passport.connect(null, defaultChainId);

      const session = window.localStorage.getItem("did-session");
      const currentSession = JSON.parse(session);

      const issuer = new Krebit.core.Krebit({
        ...information,
        litSdk: LitJsSdk,
      });
      const issuerConnection = await issuer.connect(currentSession);

      if (passportConnection && issuerConnection) {
        setPassport(passport);
        setIssuer(issuer);

        const orbisConnection = await orbis.connect_v2({
          provider: information.ethProvider,
          lit: true,
        });

        if (orbisConnection) {
          const profile = await normalizeSchema.profile({
            passport,
            orbis,
          });

          setProfile(profile);
          setStatus("resolved");
        }
      }
    } catch (error) {
      console.error(error);
      setStatus("rejected");
    }
  };

  return (
    <GeneralContext.Provider
      value={{
        auth: {
          connect,
          isAuthenticated: status === "resolved" && !!passport?.did,
          status,
          did: passport?.did,
        },
        walletInformation: {
          ...walletInformation,
          passport,
          issuer,
          publicPassport,
          orbis,
        },
        profileInformation: {
          profile,
        },
      }}
    >
      {children}
    </GeneralContext.Provider>
  );
};
