#!/usr/bin/env perl
use Mojolicious::Lite;
use JSON;

# Load the OpenAPI schema file
my $schema_file = 'FULL_itim_schema.json';
my $schema_data;

# Read and parse JSON schema
if (-e $schema_file) {
    open my $fh, '<', $schema_file or die "Could not open file '$schema_file': $!";
    local $/;
    my $json_text = <$fh>;
    close $fh;
    eval { $schema_data = decode_json($json_text) };
    die "Error parsing JSON: $@" if $@;
} else {
    die "Schema file '$schema_file' not found!";
}

# Ensure 'paths' key exists in schema
unless (exists $schema_data->{paths} && ref $schema_data->{paths} eq 'HASH') {
    die "Invalid schema: Missing or malformed 'paths' key in JSON file.";
}

# Reduce schema: Keep full details for specified endpoints, parameters only for others
my %filtered_paths;
foreach my $path (keys %{ $schema_data->{paths} }) {
    if ($path eq "/schema" || $path eq "/v1.0/endpoint/default/token" || $path eq "/people/{personId}") {
        # Keep full details for these paths
        $filtered_paths{$path} = $schema_data->{paths}{$path};
    } else {
        # Only retain parameters for all other paths
        my %methods;
        foreach my $method (keys %{ $schema_data->{paths}{$path} }) {
            if (ref $schema_data->{paths}{$path}{$method} eq 'HASH') {
                $methods{$method} = {
                    parameters => $schema_data->{paths}{$path}{$method}{parameters} // []
                };
            } else {
                $methods{$method} = {};
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

    app->log->info("GET /people/$personId requested.");

    # Ensure CSRF token is present
    #my $csrf_token = $c->req->headers->header('CSRFToken') || '';
    #unless ($csrf_token) {
    #    return $c->render(status => 400, json => { error => "Missing CSRFToken header" });
    #}

    # Fetch response from OpenAPI schema safely
    my $response = $schema_data->{paths}{"/people/{personId}"}{get}{responses}{200}{content}{"application/vnd.ibm.isim-v1+json"}{example} 
        || { error => "Mock response not found in OpenAPI schema" };

    # Log the request
    app->log->info("GET /people/$personId requested.");

    # Send response
    $c->render(json => $response);
};

# PUT /people/{personId} - Modify a person
post '/people/:personId' => sub {
    my $c        = shift;
    my $personId = $c->param('personId');

    # Extract JSON request body
    my $body = $c->req->json || {};

    # Ensure CSRF token is present
    #my $csrf_token = $c->req->headers->header('CSRFToken') || '';
    #unless ($csrf_token) {
    #    return $c->render(status => 400, json => { error => "Missing CSRFToken header" });
    #}

    # Handle optional method override (e.g., suspend, restore)
    my $method_override = $c->req->headers->header('X-HTTP-Method-Override') || '';

    # Response format
    my $response = {
        requestId      => "2565810057541954463",
        changeComplete => \1,  # Boolean true in Perl
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