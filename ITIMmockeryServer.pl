#!/usr/bin/env perl
use Mojolicious::Lite;

# Middleware to log all requests and responses
hook before_dispatch => sub {
    my $c = shift;

    # Log request details
    my $method  = $c->req->method;
    my $url     = $c->req->url->to_abs;
    my $headers = $c->req->headers->to_hash;
    my $params  = $c->req->params->to_hash;
    my $body    = $c->req->body;

    app->log->info("==== Incoming Request ====");
    app->log->info("Method: $method");
    app->log->info("URL: $url");
    app->log->info("Headers: " . join(", ", map { "$_ => $headers->{$_}" } keys %$headers));
    app->log->info("Query Params: " . join(", ", map { "$_ => $params->{$_}" } keys %$params));
    app->log->info("Body: $body");
};

hook after_dispatch => sub {
    my $c = shift;

    # Log response details
    my $status  = $c->res->code;
    my $headers = $c->res->headers->to_hash;
    my $body    = $c->res->body;

    app->log->info("==== Outgoing Response ====");
    app->log->info("Status: $status");
    app->log->info("Headers: " . join(", ", map { "$_ => $headers->{$_}" } keys %$headers));
    app->log->info("Body: $body");
};

# Route for /v1.0/endpoint/default/token
post '/v1.0/endpoint/default/token' => sub {
    my $c = shift;

    # Define the response
    my $response = {
        csrftoken  => "token-xyz",
        sessionId  => "session-xyz",
        user       => {
            id   => "12345",
            name => "Edbird"
        }
    };

    # Render the JSON response
    $c->render(json => $response);
};

# Route for /person/NO12345
get '/person/NO12345' => sub {
    my $c = shift;

    # Define the response
    my $response = {
        _links => {
            formTemplate => { href => "/itim/rest/forms?requestee=/itim/rest/people/ZXJnbG9iYWxpZD0zMjg3NTk3Njg0MDU0MDg0MTYsb3U9MCxvdT1wZW9wbGUsZXJnbG9iYWxpZD0wMDAwMDAwMDAwMDAwMDAwMDAwMCxvdT1vcmcsZGM9Y29t&filterId=formSearch" },
            manager      => { href => "/itim/rest/people/ZXJnbG9iYWxpZD0zMjg3NTk3NjYzMjY3Njc5MDksb3U9MCxvdT1wZW9wbGUsZXJnbG9iYWxpZD0wMDAwMDAwMDAwMDAwMDAwMDAwMCxvdT1vcmcsZGM9Y29t" },
            self         => { href => "/itim/rest/people/ZXJnbG9iYWxpZD0zMjg3NTk3Njg0MDU0MDg0MTYsb3U9MCxvdT1wZW9wbGUsZXJnbG9iYWxpZD0wMDAwMDAwMDAwMDAwMDAwMDAwMCxvdT1vcmcsZGM9Y29t", title => "Alan Smith" },
            erparent     => { href => "/itim/rest/organizationcontainers/organizations/ZXJnbG9iYWxpZD0wMDAwMDAwMDAwMDAwMDAwMDAwMCxvdT1vcmcsZGM9Y29t" }
        },
        _attributes => {
            uid             => "asmith",
            ercustomdisplay => "Smith",
            ersupervisor    => "erglobalid=328759766326767909,ou=0,ou=people,erglobalid=00000000000000000000,ou=org,dc=com",
            mail            => "asmit\@ibm.com",
            manager         => "erglobalid=328759766326767909,ou=0,ou=people,erglobalid=00000000000000000000,ou=org,dc=com",
            givenname       => "Alan",
            erpersonstatus  => "ACTIVE",
            name            => "Alan Smith",
            sn              => "Smith",
            cn              => "Alan Smith",
            personType      => "Person",
            erparent        => "erglobalid=00000000000000000000,ou=org,dc=com"
        }
    };

    # Render the JSON response
    $c->render(json => $response);
};

# Route for /schema
get '/schema' => sub {
    my $c = shift;

    # Define the response
    my $response = {
        openapi => "3.0.3",
        info    => { title => "Merged documentation", version => "1.0" },
        servers => [{ url => "https://192.168.2.39:30943" }],
        tags    => [
            { name => "Access Administration Batch Submit" },
            { name => "Access Management" },
            { name => "Activity Management" },
            { name => "Delegation Management" },
            { name => "Entitlement Assignments" },
            { name => "Entitlement Management" },
            { name => "Identity Policy Management" },
            { name => "LifecycleRule Management" },
            { name => "Organizational Management API" },
            { name => "Password Management" },
            { name => "Password Policy Management" },
            { name => "Person Management" },
            { name => "Search" },
            { name => "Service Management" },
            { name => "System User Management" },
            { name => "ARC Statistics APIs" },
            { name => "ARC User APIs" },
            { name => "Activity Folder APIs" },
            { name => "Business Activity APIs" },
            { name => "Business Activity Bulk APIs" },
            { name => "Business Activity Group Bulk APIs" },
            { name => "Mitigation APIs" },
            { name => "Mitigation Bulk APIs" },
            { name => "Permission Group Bulk APIs" },
            { name => "Risk APIs" },
            { name => "Risk Bulk APIs" }
        ]
    };

    # Render the JSON response
    $c->render(json => $response);
};

# Set logging level to debug
app->log->level('debug');

# Start the Mojolicious application
app->start;