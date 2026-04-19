import { api } from "@workspace/backend/_generated/api";
import { useAction } from "convex/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";


type PhoneNumbers = typeof api.private.vapi.getPhoneNumbers._returnType;
type Assistants = typeof api.private.vapi.getAssistants._returnType;

function formatConvexActionError(err: unknown): string {
  if (typeof err === "object" && err !== null) {
    const data = (err as { data?: { message?: string } }).data;
    if (data?.message && typeof data.message === "string") {
      return data.message.length > 280 ? `${data.message.slice(0, 280)}…` : data.message;
    }
  }
  if (err instanceof Error && err.message) {
    const m = err.message;
    return m.length > 280 ? `${m.slice(0, 280)}…` : m;
  }
  const s = String(err);
  return s.length > 280 ? `${s.slice(0, 280)}…` : s;
}

export const useVapiAssistants = (): {
    data: Assistants;
    isLoading: boolean;
    error: Error | null;
    retry: () => void;
} => {
    const [data, setData] = useState<Assistants>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [attempt, setAttempt] = useState(0);

    const getAssistants = useAction(api.private.vapi.getAssistants)

    useEffect(() => {
        let cancelled = false;

        const fetchData = async () => {
            try {
                setIsLoading(true)
                const result = await getAssistants();
                if (cancelled) {
                    return;
                }
                setData(result);
                setError(null)
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const msg = formatConvexActionError(error);
                setError(new Error(msg));
                toast.error(`Assistants: ${msg}`);
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        }

        fetchData();

        return () => {
            cancelled = true;
        }
    }, [attempt, getAssistants]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    return { data, isLoading, error, retry };
}


export const useVapiPhoneNumbers = (): {
    data: PhoneNumbers;
    isLoading: boolean;
    error: Error | null;
    retry: () => void;
} => {
    const [data, setData] = useState<PhoneNumbers>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [attempt, setAttempt] = useState(0);

    const getPhoneNumbers = useAction(api.private.vapi.getPhoneNumbers)

    useEffect(() => {
        let cancelled = false;
        const fetchData = async () => {
            try {
                setIsLoading(true)
                const result = await getPhoneNumbers();
                if (cancelled) {
                    return;
                }
                setData(result);
                setError(null)
            } catch (error) {
                if (cancelled) {
                    return;
                }
                const msg = formatConvexActionError(error);
                setError(new Error(msg));
                toast.error(`Phone numbers: ${msg}`);
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        }

        fetchData();

        return () => {
            cancelled = true;
        }
    }, [attempt, getPhoneNumbers]);

    const retry = useCallback(() => setAttempt((n) => n + 1), []);

    return { data, isLoading, error, retry };
}