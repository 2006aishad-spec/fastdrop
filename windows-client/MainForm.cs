using System.Drawing.Drawing2D;
using FastDrop.Windows.Networking;
using FastDrop.Windows.Protocol;
using FastDrop.Windows.Storage;

namespace FastDrop.Windows;

public sealed class MainForm : Form
{
    private readonly LocalDiscoveryService _discovery;
    private readonly PairingService _pairing = new();
    private readonly LocalTlsCertificate _tls;
    private readonly LocalTransferServer _transferServer;
    private readonly TransferStore _store = new();
    private readonly Label _statusLabel = new();
    private readonly Label _detailLabel = new();
    private readonly Label _destinationLabel = new();
    private readonly Panel _statusOrb = new();
    private string _destination;

    public MainForm()
    {
        _destination = _store.DefaultDestination;
        Text = "XTransfer Offline";
        ClientSize = new Size(760, 500);
        MinimumSize = new Size(640, 420);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(249, 250, 245);
        Font = new Font("Segoe UI", 10F);
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;

        _tls = new LocalTlsCertificate();
        _discovery = new LocalDiscoveryService(Environment.MachineName, _tls.Sha256Fingerprint);
        _transferServer = new LocalTransferServer(_pairing, _store, () => _destination, _tls.Certificate);
        _discovery.AnnouncementSent += announcement => BeginInvoke(() => SetOnlineState(announcement));
        _transferServer.StatusChanged += status => BeginInvoke(() => SetServerState(status));
        BuildUi();
        Shown += (_, _) => { _transferServer.Start(); _discovery.Start(); };
        FormClosed += async (_, _) => { await _transferServer.DisposeAsync(); await _discovery.DisposeAsync(); };
    }

    private void BuildUi()
    {
        var root = new TableLayoutPanel { Dock = DockStyle.Fill, Padding = new Padding(42, 34, 42, 30), RowCount = 5, ColumnCount = 2, BackColor = BackColor };
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 115));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 125));
        root.RowStyles.Add(new RowStyle(SizeType.Absolute, 68));
        root.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 72));
        root.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 28));
        Controls.Add(root);

        var brand = new Label { Text = "●  XTransfer Offline", AutoSize = true, Font = new Font("Segoe UI", 19F, FontStyle.Bold), ForeColor = Color.FromArgb(24, 32, 24), Dock = DockStyle.Fill };
        var pill = new Label { Text = "LOCAL / OFFLINE", AutoSize = true, TextAlign = ContentAlignment.MiddleRight, Font = new Font("Consolas", 9F, FontStyle.Bold), ForeColor = Color.FromArgb(129, 156, 39), Dock = DockStyle.Fill };
        root.Controls.Add(brand, 0, 0); root.Controls.Add(pill, 1, 0);

        var title = new Label { Text = "Pronto para\nreceber ficheiros.", AutoSize = true, Font = new Font("Segoe UI", 28F, FontStyle.Bold), ForeColor = Color.FromArgb(24, 32, 24), Dock = DockStyle.Fill };
        var orb = new Panel { Dock = DockStyle.Fill, BackColor = Color.FromArgb(216, 243, 106), Margin = new Padding(34, 14, 12, 14) };
        orb.Paint += (_, e) => { e.Graphics.SmoothingMode = SmoothingMode.AntiAlias; using var pen = new Pen(Color.FromArgb(24, 32, 24), 4); e.Graphics.DrawArc(pen, new Rectangle(22, 22, 52, 52), 35, 210); e.Graphics.DrawArc(pen, new Rectangle(36, 32, 42, 42), 215, 210); };
        root.Controls.Add(title, 0, 1); root.Controls.Add(orb, 1, 1);

        var card = new Panel { Dock = DockStyle.Fill, BackColor = Color.White, Padding = new Padding(18), Margin = new Padding(0, 8, 0, 8), BorderStyle = BorderStyle.FixedSingle };
        _statusOrb.Size = new Size(50, 50); _statusOrb.BackColor = Color.FromArgb(216, 243, 106); _statusOrb.Location = new Point(18, 25);
        _statusOrb.Paint += (_, e) => { e.Graphics.SmoothingMode = SmoothingMode.AntiAlias; using var brush = new SolidBrush(Color.FromArgb(24, 32, 24)); e.Graphics.FillEllipse(brush, 17, 17, 16, 16); };
        _statusLabel.Text = "A anunciar este PC"; _statusLabel.Font = new Font("Segoe UI", 14F, FontStyle.Bold); _statusLabel.ForeColor = Color.FromArgb(24, 32, 24); _statusLabel.Location = new Point(86, 24); _statusLabel.AutoSize = true;
        _detailLabel.Text = "Abre o XTransfer Offline no telefone para começar."; _detailLabel.Font = new Font("Segoe UI", 10F); _detailLabel.ForeColor = Color.FromArgb(111, 117, 107); _detailLabel.Location = new Point(86, 53); _detailLabel.AutoSize = true;
        card.Controls.Add(_statusOrb); card.Controls.Add(_statusLabel); card.Controls.Add(_detailLabel); root.Controls.Add(card, 0, 2); root.SetColumnSpan(card, 2);

        var destinationPanel = new Panel { Dock = DockStyle.Fill, BackColor = Color.Transparent };
        var destinationTitle = new Label { Text = "PASTA DE DESTINO", AutoSize = true, Font = new Font("Consolas", 9F, FontStyle.Bold), ForeColor = Color.FromArgb(111, 117, 107), Location = new Point(0, 2) };
        _destinationLabel.Text = _destination; _destinationLabel.AutoEllipsis = true; _destinationLabel.Font = new Font("Segoe UI", 10F, FontStyle.Bold); _destinationLabel.ForeColor = Color.FromArgb(24, 32, 24); _destinationLabel.Location = new Point(0, 25); _destinationLabel.Width = 420;
        var chooseButton = new Button { Text = "Pasta", Width = 68, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(216, 243, 106), ForeColor = Color.FromArgb(24, 32, 24), Location = new Point(435, 18) };
        chooseButton.Click += (_, _) => ChooseDestination();
        var sendToAndroid = new Button { Text = "Enviar para Android", Width = 148, Height = 34, FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(24, 32, 24), ForeColor = Color.White, Location = new Point(514, 18) };
        sendToAndroid.Click += (_, _) => { using var form = new SendToAndroidForm(_discovery); form.ShowDialog(this); };
        destinationPanel.Controls.Add(destinationTitle);
        destinationPanel.Controls.Add(_destinationLabel);
        destinationPanel.Controls.Add(chooseButton);
        destinationPanel.Controls.Add(sendToAndroid);
        root.Controls.Add(destinationPanel, 0, 3);
        root.SetColumnSpan(destinationPanel, 2);

        var footer = new Label { Text = "FD/01   •   TLS   •   streaming por chunks   •   SHA-256   •   sem conta", AutoSize = true, Font = new Font("Consolas", 9F), ForeColor = Color.FromArgb(111, 117, 107), Anchor = AnchorStyles.Left | AnchorStyles.Bottom, Dock = DockStyle.Bottom };
        root.Controls.Add(footer, 0, 4); root.SetColumnSpan(footer, 2);
    }

    private void SetOnlineState(DiscoveryAnnouncement announcement)
    {
        _statusLabel.Text = "Este PC está pronto";
        _detailLabel.Text = $"A aguardar TLS local · {announcement.ProtocolVersion} · porta {announcement.TransferPort} · código {_pairing.CurrentCode}";
        _statusOrb.BackColor = Color.FromArgb(216, 243, 106);
    }

    private void SetServerState(string status)
    {
        if (!IsDisposed) _detailLabel.Text = $"{status} · código {_pairing.CurrentCode}";
    }

    private void ChooseDestination()
    {
        using var dialog = new FolderBrowserDialog { Description = "Escolhe onde o FastDrop deve guardar os ficheiros recebidos.", SelectedPath = _destination, ShowNewFolderButton = true };
        if (dialog.ShowDialog(this) == DialogResult.OK)
        {
            _destination = dialog.SelectedPath;
            _destinationLabel.Text = _destination;
        }
    }
}
