#!/usr/bin/env perl
use Mojolicious::Lite;
use JSON;

# Load the OpenAPI schema file
my $schema_file = 'FULL_itim_schema.json';
my $schema_data;

# Read and parse JSON schema
if (-e $schema_file) {
    open my $fh, '<', $schema_file or die "Could not open file '$schema_file' $!";
    local $/;
    my $json_text = <$fh>;
    close $fh;
    eval { $schema_data = decode_json($json_text) };
    die "Error parsing JSON: $@" if $@;
} else {
    die "Schema file '$schema_file' not found!";
}

# Ensure 'paths' key exists in schema
die "Invalid schema: Missing 'paths' key" unless exists $schema_data->{paths} && ref $schema_data->{paths} eq 'HASH';

# Reduce schema: Keep only parameters except for /people/{personId} and /v1.0/endpoint/default/token
my %filtered_paths;
foreach my $path (keys %{ $schema_data->{paths} }) {
    if ($path eq "/people/{personId}" || $path eq "/v1.0/endpoint/default/token") {
        # Keep full details for these paths
        $filtered_paths{$path} = $schema_data->{paths}{$path};
    } else {
        # Only retain parameters for all other paths
        my %methods;
        foreach my $method (keys %{ $schema_data->{paths}{$path} }) {
            if (ref $schema_data->{paths}{$path}{$method} eq 'HASH') {
                $methods{$method} = {
                    parameters => $schema_data->{paths}{$path}{$method}{parameters} // []  # Keep only parameters, default to empty array
                };
            } else {
                $methods{$method} = {};  # Fallback for unexpected structure
            }
        }
        $filtered_paths{$path} = \%methods;
    }
}

# Construct the reduced OpenAPI schema
my $reduced_schema = {
    openapi => $schema_data->{openapi} // "3.0.3",
    info    => $schema_data->{info} // { title => "No title", version => "Unknown" },
    paths   => \%filtered_paths,
};

# Route for /schema - Returns the reduced OpenAPI spec
get '/schema' => sub {
    my $c = shift;
    $c->render(json => $reduced_schema);
};

# Route for /people/{personId} - Returns person details
get '/people/:personId' => sub {
    my $c        = shift;
    my $personId = $c->param('personId');    

     # Ensure CSRF token is present
    my $csrf_token = $c->req->headers->header('CSRFToken') || '';
    unless ($csrf_token) {
        return $c->render(status => 400, json => { error => "Missing CSRFToken header" });
    }
    
    # Define response payload
    my $response = {
        _links => {
            self      => { href => "/itim/rest/people/$personId", title => "Alan Smith" },
            manager   => { href => "/itim/rest/people/$personId/manager" },
            erparent  => { href => "/itim/rest/organizationcontainers/organizations/$personId" }
        },
        _attributes => {
            uid             => "asmith",
            ercustomdisplay => "Smith",
            givenname       => "Alan",
            erpersonstatus  => "ACTIVE",
            name            => "Alan Smith",
            sn              => "Smith",
            cn              => "Alan Smith",
            personType      => "Person",
            mail            => "asmith\@ibm.com",
            manager         => "erglobalid=328759766326767909,ou=0,ou=people,erglobalid=00000000000000000000,ou=org,dc=com",
            erparent        => "erglobalid=00000000000000000000,ou=org,dc=com"
        }
    };

    # Log the request
    app->log->info("GET /people/$personId requested.");

    # Send response
    $c->render(json => $response);
};

# PUT /people/{personId} - Modify a person
put '/people/:personId' => sub {
    my $c        = shift;
    my $personId = $c->param('personId');

    # Extract JSON request body
    my $body = $c->req->json || {};

    # Ensure CSRF token is present
    my $csrf_token = $c->req->headers->header('CSRFToken') || '';
    unless ($csrf_token) {
        return $c->render(status => 400, json => { error => "Missing CSRFToken header" });
    }

    # Handle optional method override (e.g., suspend, restore)
    my $method_override = $c->req->headers->header('X-HTTP-Method-Override') || '';

    # Response format
    my $response = {
        requestId      => "2565810057541954463",
        changeComplete => \0,  # Boolean false in Perl
        status         => 0,
        methodOverride => $method_override,
        personId       => $personId
    };

    app->log->info("PUT /people/$personId requested with X-HTTP-Method-Override: $method_override");

    $c->render(status => 202, json => $response);
};

# DELETE /people/{personId} - Delete a person
del '/people/:personId' => sub {
    my $c        = shift;
    my $personId = $c->param('personId');

    # Ensure CSRF token is present
    my $csrf_token = $c->req->headers->header('CSRFToken') || '';
    unless ($csrf_token) {
        return $c->render(status => 400, json => { error => "Missing CSRFToken header" });
    }

    # Response
    my $response = {
        message  => "User $personId deleted successfully.",
        status   => 202,
        personId => $personId
    };

    app->log->info("DELETE /people/$personId requested.");

    $c->render(status => 202, json => $response);
};

# Serve API base URLs dynamically
my @server_urls = (
    { url => "/itim/rest" },
    { url => "/itim/rest/v1.2" }
);

# Route for /servers - Lists all base servers
get '/servers' => sub {
    my $c = shift;
    $c->render(json => { servers => \@server_urls });
};

# Route for /v1.0/endpoint/default/token - Returns auth token
post '/v1.0/endpoint/default/token' => sub {
    my $c = shift;

    # Define token response
    my $response = {
        csrftoken => "token-xyz",
        sessionId => "session-xyz",
        user      => {
            id   => "12345",
            name => "Edbird"
        }
    };

    # Log the request
    app->log->info("GET /v1.0/endpoint/default/token requested.");

    # Send response
    $c->render(json => $response);
};


# Start the Mojolicious application
app->start;