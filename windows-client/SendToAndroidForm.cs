using FastDrop.Windows.Networking;

namespace FastDrop.Windows;

public sealed class SendToAndroidForm : Form
{
    private readonly LocalDiscoveryService _discovery;
    private readonly AndroidTransferSender _sender = new();
    private readonly ComboBox _devices = new();
    private readonly TextBox _code = new();
    private readonly ListBox _files = new();
    private readonly Label _status = new();
    private readonly Label _progress = new();
    private readonly ProgressBar _bar = new();
    private readonly Button _send = new();
    private readonly Button _pause = new();
    private readonly Button _cancel = new();
    private int _action;

    public SendToAndroidForm(LocalDiscoveryService discovery)
    {
        _discovery = discovery;
        Text = "Enviar para Android — XTransfer Offline";
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(640, 560);
        MinimumSize = new Size(600, 520);
        BackColor = Color.FromArgb(249, 250, 245);
        Font = new Font("Segoe UI", 10F);

        BuildUi();
        _discovery.AndroidDeviceDiscovered += OnAndroidDeviceDiscovered;
        RefreshDevices();
        FormClosed += (_, _) => _discovery.AndroidDeviceDiscovered -= OnAndroidDeviceDiscovered;
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(26),
            ColumnCount = 1,
            RowCount = 9,
            BackColor = BackColor
        };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 40));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 52));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 58));
        Controls.Add(root);

        var title = new Label
        {
            Text = "Enviar ficheiros para Android",
            Font = new Font("Segoe UI", 21F, FontStyle.Bold),
            ForeColor = Color.FromArgb(24, 32, 24),
            Dock = DockStyle.Fill,
            TextAlign = ContentAlignment.MiddleLeft
        };
        root.Controls.Add(title, 0, 0);
        root.Controls.Add(CreateLabel("DISPOSITIVO NA REDE LOCAL"), 0, 1);

        _devices.Dock = DockStyle.Fill;
        _devices.DropDownStyle = ComboBoxStyle.DropDownList;
        _devices.Font = new Font("Segoe UI", 10F);
        root.Controls.Add(_devices, 0, 2);

        root.Controls.Add(CreateLabel("CÓDIGO TEMPORÁRIO MOSTRADO NO TELEFONE"), 0, 3);
        _code.Dock = DockStyle.Fill;
        _code.MaxLength = 6;
        _code.CharacterCasing = CharacterCasing.Upper;
        _code.TextAlign = HorizontalAlignment.Center;
        _code.Font = new Font("Consolas", 16F, FontStyle.Bold);
        _code.PlaceholderText = "ABC234";
        root.Controls.Add(_code, 0, 4);

        var fileActions = new FlowLayoutPanel { Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight, WrapContents = false };
        var add = MakeButton("Adicionar ficheiros", Color.FromArgb(216, 243, 106));
        add.Click += (_, _) => AddFiles();
        var remove = MakeButton("Remover selecionado", Color.White);
        remove.Click += (_, _) => { if (_files.SelectedIndex >= 0) _files.Items.RemoveAt(_files.SelectedIndex); };
        fileActions.Controls.Add(add);
        fileActions.Controls.Add(remove);
        root.Controls.Add(fileActions, 0, 5);

        _files.Dock = DockStyle.Fill;
        _files.HorizontalScrollbar = true;
        _files.Font = new Font("Segoe UI", 9F);
        _files.BorderStyle = BorderStyle.FixedSingle;
        root.Controls.Add(_files, 0, 6);

        _progress.Dock = DockStyle.Fill;
        _progress.Text = "A aguardar seleção de ficheiros e telefone.";
        _progress.ForeColor = Color.FromArgb(90, 96, 86);
        _progress.TextAlign = ContentAlignment.MiddleLeft;
        root.Controls.Add(_progress, 0, 7);

        var footer = new TableLayoutPanel { Dock = DockStyle.Fill, ColumnCount = 3, RowCount = 2 };
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 42));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 29));
        footer.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 29));
        footer.RowStyles.Add(new RowStyle(SizeType.Absolute, 28));
        footer.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        _status.Text = "LOCAL · TLS · SHA-256";
        _status.ForeColor = Color.FromArgb(111, 117, 107);
        _status.Dock = DockStyle.Fill;
        _status.TextAlign = ContentAlignment.MiddleLeft;
        footer.Controls.Add(_status, 0, 0);
        footer.SetColumnSpan(_status, 3);
        _send.Text = "Enviar / Retomar";
        _send.Dock = DockStyle.Fill;
        _send.BackColor = Color.FromArgb(216, 243, 106);
        _send.FlatStyle = FlatStyle.Flat;
        _send.Click += async (_, _) => await SendAsync();
        _pause.Text = "Pausar";
        _pause.Dock = DockStyle.Fill;
        _pause.Enabled = false;
        _pause.Click += (_, _) => Interlocked.Exchange(ref _action, (int)AndroidSendAction.Pause);
        _cancel.Text = "Cancelar";
        _cancel.Dock = DockStyle.Fill;
        _cancel.Enabled = false;
        _cancel.Click += (_, _) => Interlocked.Exchange(ref _action, (int)AndroidSendAction.Cancel);
        footer.Controls.Add(_send, 0, 1);
        footer.Controls.Add(_pause, 1, 1);
        footer.Controls.Add(_cancel, 2, 1);
        root.Controls.Add(footer, 0, 8);

        _bar.Dock = DockStyle.Bottom;
        _bar.Height = 8;
        _bar.Visible = false;
        Controls.Add(_bar);
    }

    private static Label CreateLabel(string text) => new()
    {
        Text = text,
        AutoSize = true,
        Font = new Font("Consolas", 8.5F, FontStyle.Bold),
        ForeColor = Color.FromArgb(111, 117, 107),
        TextAlign = ContentAlignment.BottomLeft,
        Dock = DockStyle.Fill
    };

    private static Button MakeButton(string text, Color background) => new()
    {
        Text = text,
        AutoSize = true,
        Height = 34,
        BackColor = background,
        ForeColor = Color.FromArgb(24, 32, 24),
        FlatStyle = FlatStyle.Flat,
        Margin = new Padding(0, 0, 8, 0)
    };

    private void AddFiles()
    {
        using var dialog = new OpenFileDialog
        {
            Title = "Escolhe ficheiros para enviar ao Android",
            Multiselect = true,
            CheckFileExists = true,
            Filter = "Todos os ficheiros (*.*)|*.*"
        };
        if (dialog.ShowDialog(this) != DialogResult.OK) return;
        foreach (var path in dialog.FileNames)
            if (!_files.Items.Contains(path)) _files.Items.Add(path);
    }

    private void OnAndroidDeviceDiscovered(DiscoveredAndroidDevice device)
    {
        if (IsDisposed || !IsHandleCreated) return;
        try
        {
            BeginInvoke(() =>
            {
                var selectedId = (_devices.SelectedItem as DiscoveredAndroidDevice)?.DeviceId;
                RefreshDevices(selectedId ?? device.DeviceId);
            });
        }
        catch (InvalidOperationException) { }
    }

    private void RefreshDevices(string? selectId = null)
    {
        var devices = _discovery.AndroidDevices.OrderByDescending(x => x.LastSeen).ToArray();
        _devices.BeginUpdate();
        _devices.Items.Clear();
        foreach (var device in devices) _devices.Items.Add(device);
        _devices.EndUpdate();
        if (selectId is not null)
        {
            for (var i = 0; i < _devices.Items.Count; i++)
            {
                if (_devices.Items[i] is DiscoveredAndroidDevice item && item.DeviceId == selectId)
                {
                    _devices.SelectedIndex = i;
                    break;
                }
            }
        }
        if (_devices.SelectedIndex < 0 && _devices.Items.Count > 0) _devices.SelectedIndex = 0;
    }

    private async Task SendAsync()
    {
        if (_devices.SelectedItem is not DiscoveredAndroidDevice device)
        {
            MessageBox.Show(this, "Ativa a receção no Android e aguarda que o telefone apareça.", "Telefone não encontrado",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        if (_code.Text.Trim().Length != 6)
        {
            MessageBox.Show(this, "Introduz o código de seis caracteres apresentado no Android.", "Código necessário",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }
        var paths = _files.Items.Cast<string>().ToArray();
        if (paths.Length == 0)
        {
            MessageBox.Show(this, "Adiciona pelo menos um ficheiro.", "Sem ficheiros",
                MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Interlocked.Exchange(ref _action, (int)AndroidSendAction.Continue);
        SetBusy(true);
        _bar.Visible = true;
        _bar.Value = 0;
        _progress.Text = "A calcular hashes e a preparar ligação segura…";
        try
        {
            var reporter = new Progress<AndroidSendProgress>(value =>
            {
                if (IsDisposed) return;
                _progress.Text = $"{value.Message}  ·  {value.CurrentFile}";
                _status.Text = $"{value.Status.ToUpperInvariant()}  ·  {FormatBytes(value.SentBytes)} / {FormatBytes(value.TotalBytes)}";
                _bar.Value = value.TotalBytes <= 0 ? 0 : (int)Math.Clamp(value.SentBytes * 100d / value.TotalBytes, 0d, 100d);
            });
            var result = await _sender.SendAsync(
                device, _code.Text.Trim(), paths,
                () => (AndroidSendAction)Volatile.Read(ref _action),
                reporter);
            _progress.Text = result switch
            {
                "completed" => "Transferência concluída. O Android verificou os ficheiros.",
                "paused" => "Transferência pausada. Consulta o novo código no Android e introduz-o antes de retomar.",
                "cancelled" => "Transferência cancelada no Android.",
                _ => "Estado da transferência: " + result
            };
            if (result == "completed" || result == "cancelled" || result == "paused") _code.Clear();
        }
        catch (Exception error)
        {
            _progress.Text = "A transferência não foi concluída: " + error.Message;
        }
        finally
        {
            SetBusy(false);
            _pause.Enabled = false;
            _cancel.Enabled = false;
        }
    }

    private void SetBusy(bool busy)
    {
        _send.Enabled = !busy;
        _pause.Enabled = busy;
        _cancel.Enabled = busy;
        _devices.Enabled = !busy;
        _code.Enabled = !busy;
        _files.Enabled = !busy;
    }

    private static string FormatBytes(long value)
    {
        if (value < 1024) return value + " B";
        var amount = value / 1024d;
        var units = new[] { "KB", "MB", "GB", "TB" };
        var index = 0;
        while (amount >= 1024 && index < units.Length - 1) { amount /= 1024; index++; }
        return amount.ToString(amount >= 10 ? "0" : "0.0") + " " + units[index];
    }
}
