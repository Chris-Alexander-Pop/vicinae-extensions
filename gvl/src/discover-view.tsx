import { useCallback, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { GlobalActions, HubDropdown } from "./actions";
import { ConfigForm } from "./config-form";
import { crawlDevices, listDevices } from "./gvl";
import {
  errMessage,
  formatStatusLine,
  type DiscoveredDevice,
} from "./status";
import type { HubCtx } from "./types";

function deviceTitle(d: DiscoveredDevice): string {
  return d.sku || d.device || d.ip;
}

function deviceSubtitle(d: DiscoveredDevice): string {
  const bits = [d.ip];
  if (d.device && d.device !== d.sku) bits.push(d.device);
  if (d.how) bits.push(d.how);
  return bits.join(" · ");
}

export function DiscoverView({ ctx }: { ctx: HubCtx }) {
  const { push } = useNavigation();
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "Scanning…",
    });
    try {
      const found = await listDevices();
      setDevices(found);
      setError(null);
      toast.style = Toast.Style.Success;
      toast.title =
        found.length === 0
          ? "No devices"
          : `Found ${found.length} device${found.length === 1 ? "" : "s"}`;
    } catch (err) {
      const message = errMessage(err);
      setError(message);
      toast.style = Toast.Style.Failure;
      toast.title = "Discover failed";
      toast.message = message;
    } finally {
      setLoading(false);
    }
  }, []);

  const crawl = useCallback(async (save: boolean) => {
    setLoading(true);
    const toast = await showToast({
      style: Toast.Style.Animated,
      title: save ? "Crawling LAN and saving…" : "Crawling LAN…",
      message: "This can take a while",
    });
    try {
      const found = await crawlDevices(save);
      setDevices(found);
      setError(null);
      toast.style = Toast.Style.Success;
      toast.title =
        found.length === 0
          ? "No devices"
          : `Found ${found.length} device${found.length === 1 ? "" : "s"}`;
      if (save && found.length > 0) {
        toast.message = "Saved address to gvl config";
        await ctx.refresh();
      }
    } catch (err) {
      const message = errMessage(err);
      setError(message);
      toast.style = Toast.Style.Failure;
      toast.title = "Crawl failed";
      toast.message = message;
    } finally {
      setLoading(false);
    }
  }, [ctx]);

  useEffect(() => {
    void scan();
  }, [scan]);

  const saveAddress = async (ip: string) => {
    const ok = await ctx.run(
      ["config", "set-address", ip],
      `Save address ${ip}`,
    );
    if (ok) await ctx.refresh();
  };

  const openConfig = () => {
    push(<ConfigForm config={ctx.config} onSaved={() => void ctx.refresh()} />);
  };

  const nav = ctx.status
    ? `Discover · ${formatStatusLine(ctx.status)}`
    : "Discover";

  return (
    <List
      isLoading={loading || ctx.loading}
      navigationTitle={nav}
      searchBarPlaceholder="Devices and config…"
      searchBarAccessory={<HubDropdown tab={ctx.tab} onChange={ctx.setTab} />}
    >
      <List.Section title="Scan">
        <List.Item
          title="Multicast discover"
          subtitle="Ask gvld or scan this LAN"
          icon={Icon.MagnifyingGlass}
          keywords={["scan", "discover", "multicast"]}
          actions={
            <ActionPanel>
              <Action
                title="Discover"
                icon={Icon.MagnifyingGlass}
                onAction={() => void scan()}
              />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Crawl LAN"
          subtitle="Unicast subnet probe (always local UDP, can be slow)"
          icon={Icon.Wifi}
          keywords={["crawl", "probe", "subnet"]}
          actions={
            <ActionPanel>
              <Action
                title="Crawl"
                icon={Icon.Wifi}
                onAction={() => void crawl(false)}
              />
              <Action
                title="Crawl and save address"
                icon={Icon.HardDrive}
                onAction={() => void crawl(true)}
              />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section
        title={
          devices.length > 0
            ? `Devices · ${devices.length}`
            : error
              ? "Devices"
              : "Devices"
        }
      >
        {devices.length === 0 ? (
          <List.Item
            title={error ? "No devices (error)" : "No devices yet"}
            subtitle={error ?? "Try crawl if multicast misses"}
            icon={{
              source: Icon.Exclamationmark,
              tintColor: error ? Color.Orange : Color.SecondaryText,
            }}
            actions={
              <ActionPanel>
                <Action
                  title="Discover"
                  icon={Icon.MagnifyingGlass}
                  onAction={() => void scan()}
                />
                <Action
                  title="Crawl"
                  icon={Icon.Wifi}
                  onAction={() => void crawl(false)}
                />
                <GlobalActions ctx={ctx} />
              </ActionPanel>
            }
          />
        ) : (
          devices.map((d) => (
            <List.Item
              key={`${d.ip}-${d.how ?? ""}`}
              title={deviceTitle(d)}
              subtitle={deviceSubtitle(d)}
              icon={{ source: Icon.LightBulb, tintColor: Color.Yellow }}
              accessories={[
                { text: d.ip },
                ...(d.how
                  ? [{ tag: { value: d.how, color: Color.Blue } }]
                  : []),
              ]}
              keywords={[d.ip, d.sku ?? "", d.device ?? "", "govee"]}
              actions={
                <ActionPanel>
                  <Action
                    title="Save as default address"
                    icon={Icon.HardDrive}
                    onAction={() => void saveAddress(d.ip)}
                  />
                  <Action.CopyToClipboard title="Copy IP" content={d.ip} />
                  <GlobalActions ctx={ctx} />
                </ActionPanel>
              }
            />
          ))
        )}
      </List.Section>

      <List.Section title="Config">
        <List.Item
          title="Daemon URL"
          subtitle={ctx.config?.url || "(not set)"}
          icon={Icon.Globe01}
          accessories={[
            {
              tag: {
                value: ctx.hasDaemon ? "in use" : "skipped",
                color: ctx.hasDaemon ? Color.Green : Color.SecondaryText,
              },
            },
          ]}
          keywords={["url", "gvld", "daemon", "config"]}
          actions={
            <ActionPanel>
              <Action title="Edit Config" icon={Icon.Cog} onAction={openConfig} />
              {ctx.config?.url ? (
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={ctx.config.url}
                />
              ) : null}
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Device address"
          subtitle={ctx.config?.address || "(not set)"}
          icon={Icon.Network}
          keywords={["address", "ip", "config"]}
          actions={
            <ActionPanel>
              <Action title="Edit Config" icon={Icon.Cog} onAction={openConfig} />
              {ctx.config?.address ? (
                <Action.CopyToClipboard
                  title="Copy address"
                  content={ctx.config.address}
                />
              ) : null}
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
        <List.Item
          title="Daemon token"
          subtitle={ctx.config?.tokenSet ? "set" : "not set"}
          icon={Icon.Key}
          keywords={["token", "auth", "config"]}
          actions={
            <ActionPanel>
              <Action title="Edit Config" icon={Icon.Cog} onAction={openConfig} />
              <GlobalActions ctx={ctx} />
            </ActionPanel>
          }
        />
        {ctx.config?.path ? (
          <List.Item
            title="Config file"
            subtitle={ctx.config.path}
            icon={Icon.BlankDocument}
            actions={
              <ActionPanel>
                <Action.CopyToClipboard
                  title="Copy path"
                  content={ctx.config.path}
                />
                <Action.ShowInFinder
                  title="Show config file"
                  path={ctx.config.path}
                />
                <GlobalActions ctx={ctx} />
              </ActionPanel>
            }
          />
        ) : null}
      </List.Section>
    </List>
  );
}
