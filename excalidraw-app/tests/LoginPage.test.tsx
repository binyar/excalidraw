import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { vi } from "vitest";

import { authApi } from "../auth/client";
import { LoginPage } from "../auth/LoginPage";

describe("workspace login", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("only shows the core login fields and reports invalid credentials", async () => {
    vi.spyOn(authApi, "login").mockRejectedValue(
      new Error("用户名或密码错误"),
    );

    render(<LoginPage authenticated={false} />);

    expect(screen.getByLabelText("用户名")).toHaveValue("fanmd");
    expect(screen.getByLabelText("密码")).toBeTruthy();
    expect(screen.queryByText("注册账号")).toBeNull();
    expect(screen.queryByText("忘记密码")).toBeNull();

    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("用户名或密码错误");
    });
    expect(authApi.login).toHaveBeenCalledWith("fanmd", "wrong");
  });
});
